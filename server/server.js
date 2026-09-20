require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { read, write, init } = require("./db");
const { sign, auth, findUserById } = require("./auth");

init();

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "..", "public");
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const id = prefix => `${prefix}-${crypto.randomBytes(5).toString("hex")}`;

function score(q, text) {
  const words = q.toLowerCase().split(/\W+/).filter(Boolean);
  const t = text.toLowerCase();
  return words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
}

app.get("/api/health", (req,res) => res.json({ok:true, service:"BIS Setu API", time:new Date().toISOString()}));

app.post("/api/auth/register", (req,res) => {
  const { name, email, password, role="msme" } = req.body;
  if (!name || !email || !password) return res.status(400).json({error:"Name, email and password are required"});
  const users = read("users");
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({error:"Email already registered"});
  const user = { id:id("u"), name, email, password, role, createdAt:new Date().toISOString() };
  users.push(user); write("users", users);
  res.json({ token:sign(user), user:{id:user.id,name:user.name,email:user.email,role:user.role} });
});

app.post("/api/auth/login", (req,res) => {
  const {email,password} = req.body;
  const user = read("users").find(u => u.email.toLowerCase() === String(email||"").toLowerCase() && u.password === password);
  if (!user) return res.status(401).json({error:"Invalid email or password"});
  res.json({ token:sign(user), user:{id:user.id,name:user.name,email:user.email,role:user.role} });
});

app.get("/api/auth/me", auth, (req,res) => {
  const u = findUserById(req.user.sub);
  if (!u) return res.status(404).json({error:"User not found"});
  res.json({id:u.id,name:u.name,email:u.email,role:u.role});
});

app.get("/api/dashboard", auth, (req,res) => {
  const certs = read("certifications").filter(c => c.userId === req.user.sub);
  res.json({
    verificationPercent: 60,
    completed: 6,
    total: 10,
    certifications: certs,
    alerts: ["LED Bulb testing report is in progress", "SMPS document submission pending"]
  });
});

const products = [
  {name:"LED Bulb", license:"CM/L-DEMO-123456", manufacturer:"EcoLighting Pvt. Ltd.", standard:"IS XXXX (Demo)", status:"Active", verified:true},
  {name:"Water Pump", license:"CM/L-DEMO-789012", manufacturer:"EcoLighting Pvt. Ltd.", standard:"IS ZZZZ (Demo)", status:"Active", verified:true}
];

app.get("/api/products", auth, (req,res)=>res.json(products));

app.post("/api/products/verify", auth, (req,res) => {
  const { productName, code } = req.body;
  const p = products.find(x => x.name.toLowerCase() === String(productName||"").toLowerCase() || x.license === code);
  if (!p) return res.json({verified:false, message:"No matching demo record found", demo:true});
  res.json({...p, demo:true});
});

app.get("/api/documents", auth, (req,res) => {
  res.json(read("documents").map(({id,name,source,pages})=>({id,name,source,pages})));
});

app.post("/api/documents/upload", auth, upload.single("file"), (req,res) => {
  if (!req.file) return res.status(400).json({error:"No file uploaded"});
  const docs = read("documents");
  const doc = {
    id:id("doc"),
    name:req.file.originalname,
    source:"User uploaded document",
    pages:1,
    text:`Uploaded document: ${req.file.originalname}. Text extraction is represented in this prototype. Add a PDF/OCR extraction service in production.`
  };
  docs.push(doc); write("documents", docs);
  res.json({message:"Document uploaded and indexed (prototype)", document:{id:doc.id,name:doc.name,source:doc.source}});
});

app.get("/api/documents/:id", auth, (req,res) => {
  const d = read("documents").find(x=>x.id===req.params.id);
  if(!d) return res.status(404).json({error:"Document not found"});
  res.json(d);
});

app.get("/api/documents/search", auth, (req,res) => {
  const q = String(req.query.q||"").trim();
  if(!q) return res.status(400).json({error:"q is required"});
  const results = read("documents").map(d=>({...d,relevance:score(q,d.text+" "+d.name)}))
    .filter(x=>x.relevance>0).sort((a,b)=>b.relevance-a.relevance).slice(0,5);
  res.json({query:q, results});
});

app.post("/api/ai/chat", auth, async (req,res) => {
  const {message} = req.body;
  if(!message) return res.status(400).json({error:"message is required"});
  const docs = read("documents");
  const relevant = docs.map(d=>({...d,relevance:score(message,d.text+" "+d.name)}))
    .sort((a,b)=>b.relevance-a.relevance).slice(0,3);

  const context = relevant.map(d=>`SOURCE: ${d.name}\n${d.text}`).join("\n\n");
  const fallback = `BIS Setu demo answer: Based on the indexed demo knowledge base, your question relates to ${relevant[0]?.name || "BIS standards"}. The production system would retrieve the current official document, answer in simple language, and show the exact source, clause and page.`;

  if (!process.env.OPENAI_API_KEY) {
    return res.json({answer:fallback, citations:relevant.map(d=>({document:d.name,clause:"5.2 (Demo)",page:12})), mode:"demo"});
  }

  try {
    const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
    const response = await fetch(`${base}/responses`, {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
      },
      body:JSON.stringify({
        model,
        input:[
          {role:"system",content:"You are BIS Setu, a standards knowledge assistant. Answer only from the supplied context. If the context is insufficient, say that clearly. Never claim a demo record is an official BIS record."},
          {role:"user",content:`Question: ${message}\n\nKnowledge base context:\n${context}`}
        ]
      })
    });
    const data = await response.json();
    if(!response.ok) throw new Error(data.error?.message || "AI request failed");
    const answer = data.output_text || fallback;
    res.json({
      answer,
      citations:relevant.map(d=>({document:d.name,clause:"Relevant section (verify in source)",page:"See source"})),
      mode:"openai"
    });
  } catch(err) {
    res.json({answer:fallback, citations:relevant.map(d=>({document:d.name,clause:"5.2 (Demo)",page:12})), mode:"fallback", warning:err.message});
  }
});

app.get("/api/certifications", auth, (req,res) => {
  res.json(read("certifications").filter(c=>c.userId===req.user.sub));
});

app.post("/api/certifications", auth, (req,res) => {
  const {product, manufacturer, standard} = req.body;
  if(!product) return res.status(400).json({error:"product is required"});
  const cert = {id:id("cert"),userId:req.user.sub,product,manufacturer:manufacturer||"User MSME",standard:standard||"Candidate Standard (Demo)",status:"Document Submission",progress:25,steps:["Application","Document Submission","Testing","Inspection","Approval"],completed:1,updatedAt:new Date().toISOString()};
  const data=read("certifications"); data.push(cert); write("certifications",data); res.status(201).json(cert);
});

app.patch("/api/certifications/:id", auth, (req,res) => {
  const data=read("certifications"); const i=data.findIndex(c=>c.id===req.params.id && c.userId===req.user.sub);
  if(i<0) return res.status(404).json({error:"Certification not found"});
  data[i]={...data[i],...req.body,updatedAt:new Date().toISOString()}; write("certifications",data); res.json(data[i]);
});

app.get("/api/certificates", auth, (req,res)=>res.json([{id:"certificate-demo-001",product:"LED Bulb",manufacturer:"EcoLighting Pvt. Ltd.",standard:"IS XXXX (Demo)",certificateNo:"CM/L-DEMO-123456",status:"Demo"}]));

app.get("/api/certificates/:id", auth, (req,res)=>res.json({id:req.params.id,product:"LED Bulb",manufacturer:"EcoLighting Pvt. Ltd.",standard:"IS XXXX (Demo)",certificateNo:"CM/L-DEMO-123456",status:"Demo"}));

app.use((req, res, next) => {
  if (req.method === "GET") {
    return res.sendFile(path.join(publicDir, "index.html"));
  }
  next();
});

app.listen(PORT,()=>console.log(`BIS Setu running at http://localhost:${PORT}`));
