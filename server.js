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

    await summary();

    const doctorRef = db.collection("DoctorData").doc("doctor1@example.com");
    const doctorRes = await doctorRef.get();
    const doctorData = doctorRes.data();

    let allPatientDataArray = doctorData.PatientData;

    const patientData = {
      email: userData.email,
      doctorPass: userData.doctorPass,
    };

    // Check if the object exists in the array
    if (
      !allPatientDataArray.some(
        (item) =>
          item.email === patientData.email &&
          item.doctorPass === patientData.doctorPass
      )
    ) {
      // Push the object into the array if it doesn't exist
      allPatientDataArray.push(patientData);
    }
    console.log(allPatientDataArray);
    await db.collection("DoctorData").doc("doctor1@example.com").update({
      PatientData: allPatientDataArray,
    });

    res.render("user", {
      user: userData,
    });
  } catch (e) {
    res.send(e);
  }
});

// ---------------------firestore structure-------------------------------

// const userData = {
//   firstName: "William",
//   lastName: "Clark",
//   sex: "Male",
//   age: 33,
//   phone: "7776665555",
//   email: "william@example.com",
//   password: "williampass",
//   bloodGroup: "O+",
//   height: "180cm",
//   weight: "75kg",
//   totalCases: 2,
//   cases: [
//       {
//           time: "Wednesday, 4:15 PM",
//           caseTitle: "Sore Throat",
//           description: "Had a sore throat on Wednesday afternoon"
//       },
//       {
//           time: "Friday, 5:30 PM",
//           caseTitle: "Fever",
//           description: "Experienced fever symptoms on Friday evening"
//       }
//   ],
//   firstData: "Allergic to dust mites, otherwise healthy",
//   patientBasicData: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
//   chatHistory: [],
//   doctorPass: "112233"
// }

// db.collection("PatientData").doc(userData.email).set(userData);
