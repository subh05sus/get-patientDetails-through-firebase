require("dotenv").config();
const express = require("express");
const app = express();


// ---------------------openai----------------------

const OpenAI = require("openai");
const credentials = require("./key.json");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});



// -----------------------firebase-----------------
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(credentials),
});
const db = admin.firestore();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ----------------------port----------------------------
const PORT = 3000;
app.listen(PORT, () => console.log(`Example app listening on port ${PORT}!`));



// ----------------------ejs view engine------------------------
const ejs = require("ejs");
app.set("view engine", "ejs"); 

// --------------------new----------------------------------
app.get("/new", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});





app.get("/", (req, res) => {
  res.sendFile(__dirname + "/home.html");
});







// -------------------------read------------------------------

app.post("/PatientData", async (req, res) => {
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

    // ------------------------generation of summary-----------------------------
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

    // ----------------------doctor db integration------------------------
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
    await db.collection("DoctorData").doc("doctor1@example.com").update({
      PatientData: allPatientDataArray,
    });

    // ------------------fetching all patient Data-----------------

    console.log(allPatientDataArray);

    if (userData.password !== userPasskey) {
      res.send("Incorrect passkey");
      return;
    }

    for (let i = 0; i < allPatientDataArray.length; i++) {
      const element = allPatientDataArray[i];
      try {
        const allDataRef = db.collection("PatientData").doc(element.email);
        const allDataRes = await allDataRef.get();
        const allData = allDataRes.data();
        if (element.doctorPass === allData.doctorPass) {
          console.log(allData);
        }
      } catch (error) {}
    }

    res.render("user", {
      user: userData,
    });
  } catch (e) {
    res.send(e);
  }
});

// ----------------all data------------------------

app.get("/allData", async (req, res) => {
  try {
    const doctorRef = db.collection("DoctorData").doc("doctor1@example.com");
    const doctorRes = await doctorRef.get();
    const doctorData = doctorRes.data();

    let allPatientDataArray = doctorData.PatientData;
    let allPatientDataToBeRendered = []

    for (let i = 0; i < allPatientDataArray.length; i++) {
      const element = allPatientDataArray[i];

      const userRef = db
        .collection("PatientData")
        .doc(allPatientDataArray[i].email);
      const response = await userRef.get();

      if (!response.exists) {
        res.send("User not found");
        return;
      }

      const userData = response.data();

      allPatientDataToBeRendered.push(userData)

      
    }
    const popupContent =[] 
    for (let i = 0; i < allPatientDataArray.length; i++) {
      let patientHTML = `
      <h2>Patient Details</h2>
      <p><b>Name:</b> ${allPatientDataToBeRendered[i].firstName} ${allPatientDataToBeRendered[i].lastName}</p>
      <p><b>Sex:</b> ${allPatientDataToBeRendered[i].sex}</p>
      <p><b>Age:</b> ${allPatientDataToBeRendered[i].age}</p>
      <p><b>Phone Number:</b> ${allPatientDataToBeRendered[i].phone}</p>
      <p><b>Email:</b> ${allPatientDataToBeRendered[i].email}</p>
      `
      popupContent.push(patientHTML)
    }
      

    res.render("allData", {
      allPatientDataToBeRendered,
      popupC: popupContent,
    });
  } catch (e) {
    console.error(e);
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
