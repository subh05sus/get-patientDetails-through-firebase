require("dotenv").config();
const express = require("express");
const app = express();

const admin = require("firebase-admin");
const credentials = require("./key.json");

const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

admin.initializeApp({
  credential: admin.credential.cert(credentials),
});
const db = admin.firestore();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = 3000;
app.listen(PORT, () => console.log(`Example app listening on port ${PORT}!`));

const ejs = require("ejs"); // Require EJS

// ...

app.set("view engine", "ejs"); // Set EJS as the view engine

// --------------------view----------------------------------
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// -------------------------read------------------------------

app.post("/read", async (req, res) => {
  const userId = req.body.id;
  const userPasskey = req.body.passkey;

  if (!userId || !userPasskey) {
    res.send("User ID or passkey is missing.");
    return;
  }

  try {
    const userRef = db.collection("PatientData").doc(userId);
    const response = await userRef.get();

    if (!response.exists) {
      res.send("User not found");
      return;
    }

    const userData = response.data();

    if (userData.password !== userPasskey) {
      res.send("Incorrect passkey");
      return;
    }

    let caseHistory =
      "You are a bot who takes case history of a patient and summarizes it into 3-4 sentences that a doctor can easity understand. ONLY PROVIDE THE SUMMARY, NO SUMMARY TITLES\n\nHere's the case history of patient:\n";
    caseHistory += userData.patientBasicData;
    userData.cases.forEach((caseItem, index) => {
      caseHistory += `${index + 1}. ${caseItem.caseTitle}\n${
        caseItem.description
      }\n\n`;
    });
    caseHistory += "NOW GIVE THE SUMMARY";

    let summaryofPatient = userData.patientBasicData;
    
    const summary = async () => {
      const chatCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "assistant", content: caseHistory }],
        max_tokens: 100,
      });
      summaryofPatient = chatCompletion.choices[0].message.content;
      console.log(summaryofPatient);

      await db.collection("PatientData").doc(userId).update({
        patientBasicData: summaryofPatient,
      });
    };

    summary();





    res.render("user", {
      user: userData,
    });
  } catch (e) {
    res.send(e);
  }
});

// ---------------------firestore structure------------------------------------------------
// const userData = {
//     firstName: "Alice",
//     lastName: "Smith",
//     sex: "Female",
//     age: 25,
//     phone: "1234567890",
//     email: "alice@example.com",
//     password: "securepass",
//     bloodGroup: "O+",
//     height: "160cm",
//     weight: "65kg",
//     totalCases: 2,
//     cases: [
//         {
//             time: "Monday, 8:00 AM",
//             caseTitle: "Headache",
//             description: "Had a headache on Monday morning"
//         },
//         {
//             time: "Wednesday, 3:30 PM",
//             caseTitle: "Allergy",
//             description: "Experienced allergy symptoms on Wednesday"
//         }
//     ],
//     firstData: "Allergic to peanuts, otherwise healthy",
//     patientBasicData:""
// };

// const userData = {
//     firstName: "Eva",
//     lastName: "Williams",
//     sex: "Female",
//     age: 28,
//     phone: "5551234567",
//     email: "eva@example.com",
//     password: "mypassword",
//     bloodGroup: "AB+",
//     height: "162cm",
//     weight: "58kg",
//     totalCases: 0,
//     cases: [],
//     patientBasicData: "No recent medical history"
// };

// db.collection("PatientData").doc(userData.email).set(userData);
