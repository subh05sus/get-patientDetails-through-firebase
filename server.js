require("dotenv").config();
const express = require("express");
const app = express();
const fs = require("fs"); // If using Node.js
const markdownIt = require("markdown-it")();

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
const storage = admin.storage();
var storageRef = storage.bucket("meow");

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

function readMarkdownFile(filename) {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, "utf8", (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}
let mergedContent = [];
async function mergeMarkdownFiles(files, chatHistory) {
  try {
    for (const file of files) {
      const markdownContent = await readMarkdownFile(file);
      // console.log(markdownContent);
      mergedContent.push(markdownContent);
    }
  } catch (error) {
    console.error(error);
  }
}

// List of Markdown files to merge
const markdownFiles = [
  "system_01_intake.md",
  "system_02_prepare_notes.md",
  "system_03_diagnosis.md",
  "system_04_clinical.md",
  "system_05_referrals.md",
];

// Call the function to merge the Markdown files
// mergeMarkdownFiles(markdownFiles,"");

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
    caseHistory += await userData.patientBasicData;
    userData.cases.forEach((caseItem, index) => {
      caseHistory += `${index + 1}. ${caseItem.caseTitle}\n${
        caseItem.description
      }\n\n`;
    });
    let chatHist = await userData.chatHistory;
    const chatString = chatHist.map(message => `${message.role}: ${message.content}`).join('\n');

    // console.log(chatString);



    caseHistory += chatString;
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


    const lmaoded = async () => {
      //------------------------------------keynotes generation--------------------------------
      const chatCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "assistant", content: chatString+"\n\nYou are a charting bot that will be given a patient intake transcription. You are to translate the chat log into thorough medical notes for the physician. Don't divide it into subgroups. Give the string only of important keypoints that the patient having, each element is supposed to be separated by a fullstop(.) and contain under 10 words." }],
        max_tokens: 600,
      });
      keygenhaha = chatCompletion.choices[0].message.content;
      console.log(keygenhaha);
      let keynoteArr = keygenhaha.split(".")
      console.log(keynoteArr)
      console.log(keynoteArr.length)
      keynoteArr.pop()
      console.log("\n\nkeynotes\n")
      for (let i = 0; i < keynoteArr.length; i++) {
        const element = keynoteArr[i];
        console.log(i+".\n"+element)
      }
      await db.collection("PatientData").doc(userId).update({
        keynotes: keynoteArr,
      });


      // -------------------------------under diagnosis gen----------------------------------
      const diagnosisChatCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "assistant", content: chatString+"\n\nYou are a charting bot that will be given a patient intake transcription. you just tell us with what dicease or problem the 'under diagnosis' part should be exaplained. give answer carefully as you are now nothing gonna change this in future until it cures, respond with the dicease name or problem name in such a way, that it is globally offical. SEND THE dicease name or problem name ONLY" }],
        max_tokens: 100,
      });
      underdiagno = await diagnosisChatCompletion.choices[0].message.content;
      console.log(underdiagno);
      await db.collection("PatientData").doc(userId).update({
        underdignosis: underdiagno,
      });
      
    };
    
    await lmaoded();
    

    // mergeMarkdownFiles(markdownFiles, chatHistory);

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
        // if (element.doctorPass === allData.doctorPass) {
        //   console.log(allData);
        // }
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
    let allPatientDataToBeRendered = [];

    for (let i = 0; i < allPatientDataArray.length; i++) {
      const userRef = db
        .collection("PatientData")
        .doc(allPatientDataArray[i].email);
      const response = await userRef.get();

      if (!response.exists) {
        res.send("User not found");
        return;
      }

      const userData = response.data();
      allPatientDataToBeRendered.push(userData);

      console.log(allPatientDataToBeRendered[i].keynotes);
    }

    res.render("allData", {
      allPatientDataToBeRendered,
    });
  } catch (e) {
    console.error(e);
    res.send(e);
  }
});

app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/login.html");
});

// ---------------------firestore structure-------------------------------

// const userData = {
//   firstName: "Subhadip",
//   lastName: "Saha",
//   sex: "Male",
//   age: 18,
//   phone: "8653462940",
//   email: "subhadipsaha@gmail.com",
//   password: "williampass",
//   bloodGroup: "AB+",
//   height: "180cm",
//   weight: "85kg",
//   totalCases: 2,
//   keynotes: [
//   "Red eyes and continuous watering",
//   "Itching and occasional discharge from the eyes",
//   "Blurry vision and sensitivity to light",
//   "Swelling and redness observed in the eyeball itself",
//   "Pain and discomfort when applying pressure to the eyes",
//   "No recent eye injuries or exposure to irritants reported",
//   "Suspected conjunctivitis (pink eye)",
//   "Patient advised to seek medical attention from an eye care professional for proper diagnosis and treatment"
// ],
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
//   patientBasicData: "",
//   chatHistory: [
//   { role: "user", content: "hey" },
//   { role: "system", content: "Hello! How can I assist you today?" },
//   { role: "user", content: "I need assistance regarding my eye problem" },
//   { role: "system", content: "I'm here to help. Can you please describe the symptoms you are experiencing with your eyes?" },
//   { role: "user", content: "my eyes are looking red continuously watering" },
//   { role: "system", content: "I see. Thank you for sharing that. Have you noticed any other symptoms such as itching, burning, or any pain in your eyes?" },
//   { role: "user", content: "yes it is itching and sometimes dirt is coming out of it" },
//   { role: "system", content: "I understand. Itching and discharge can be quite uncomfortable. Have you experienced any changes in your vision, such as blurriness or sensitivity to light?" },
//   { role: "user", content: "yes sometimes due to the water is blurry and it is slightly sensitive to light" },
//   { role: "system", content: "Thank you for providing that information. It's helpful to know about the blurry vision and sensitivity to light. Have you noticed any swelling or redness around your eyes or eyelids?" },
//   { role: "user", content: "Yes there is swelling and redness in the eyeball itself" },
//   { role: "system", content: "I see. Swelling and redness in the eyeball itself can be concerning. Have you experienced any eye pain or discomfort, especially when moving your eyes or applying pressure to them?" },
//   { role: "user", content: "yes applying pressure is creating pain and discomfort in it but not any problem while moving my eyes" },
//   { role: "system", content: "Thank you for sharing that. Pain and discomfort when applying pressure to the eyes can be significant. Have you had any recent eye injuries or exposure to any irritants, such as chemicals or foreign objects?" },
//   { role: "user", content: "no" },
//   { role: "system", content: "Thank you for clarifying that. It's helpful to know that there haven't been any recent eye injuries or exposure to irritants. Based on the symptoms you've described, it seems like you may be experiencing conjunctivitis, also known as pink eye. I would recommend seeking medical attention from an eye care professional for a proper diagnosis and appropriate treatment. Is there anything else I can assist you with?" },
//   { role: "user", content: "no thanks for all DONE" },
//   { role: "system", content: "You're welcome! I'm glad I could assist you. If you have any more questions in the future, feel free to ask. Take care and I hope you feel better soon!" }
// ],
//   doctorPass: "112233",
//   underdignosis: "Conjunctivitis"
// }

// db.collection("PatientData").doc(userData.email).set(userData);
