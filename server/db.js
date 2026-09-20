const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

const files = {
  users: path.join(DATA, "users.json"),
  documents: path.join(DATA, "documents.json"),
  certifications: path.join(DATA, "certifications.json")
};

const defaults = {
  users: [{
    id: "u-demo",
    name: "EcoLighting Pvt. Ltd.",
    email: "demo@bis-setu.local",
    password: "demo123",
    role: "msme",
    createdAt: new Date().toISOString()
  }],
  documents: [
    {
      id: "doc-led",
      name: "LED Bulb Safety Standard — Demo",
      text: "LED lamps and self-ballasted LED lamps. Safety requirements, marking, electrical safety, testing, construction and performance. Demonstration document for BIS Setu.",
      source: "BIS Standard Demo",
      pages: 18
    },
    {
      id: "doc-smps",
      name: "SMPS Unit Verification — Demo",
      text: "Switch mode power supply requirements, electrical safety, insulation, marking, testing and compliance. Demonstration document for BIS Setu.",
      source: "BIS Standard Demo",
      pages: 22
    },
    {
      id: "doc-pump",
      name: "Water Pump Certification — Demo",
      text: "Water pump product requirements, testing, marking, documentation and certification workflow. Demonstration document for BIS Setu.",
      source: "BIS Standard Demo",
      pages: 20
    }
  ],
  certifications: [
    {
      id: "cert-001",
      userId: "u-demo",
      product: "LED Bulb",
      manufacturer: "EcoLighting Pvt. Ltd.",
      standard: "IS XXXX (Demo)",
      status: "Testing",
      progress: 75,
      steps: ["Application", "Document Submission", "Testing", "Inspection", "Approval"],
      completed: 2,
      updatedAt: new Date().toISOString()
    },
    {
      id: "cert-002",
      userId: "u-demo",
      product: "SMPS Unit",
      manufacturer: "EcoLighting Pvt. Ltd.",
      standard: "IS YYYY (Demo)",
      status: "Document Submission",
      progress: 50,
      steps: ["Application", "Document Submission", "Testing", "Approval"],
      completed: 1,
      updatedAt: new Date().toISOString()
    }
  ]
};

function read(name) {
  const f = files[name];
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, JSON.stringify(defaults[name], null, 2));
  }
  return JSON.parse(fs.readFileSync(f, "utf8"));
}
function write(name, data) {
  fs.writeFileSync(files[name], JSON.stringify(data, null, 2));
}
function init() {
  for (const name of Object.keys(files)) read(name);
}
module.exports = { read, write, init };
