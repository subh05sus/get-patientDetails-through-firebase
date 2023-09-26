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
const openai2 = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY_2,
});

// -----------------------firebase-----------------
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(credentials),
});
const db = admin.firestore();

var auth = admin.auth();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const storage = admin.storage();
var storageRef = storage.bucket("meow");

// ----------------------port----------------------------
const PORT = 8080;
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
      "You are a bot who takes case history of a patient and summarizes it into 1-2 sentences that a doctor can easity understand. ONLY PROVIDE THE SUMMARY, NO SUMMARY TITLES\n\nHere's the case history of patient:\n";
    caseHistory += await userData.patientBasicData;
    userData.cases.forEach((caseItem, index) => {
      caseHistory += `${index + 1}. ${caseItem.caseTitle}\n${
        caseItem.description
      }\n\n`;
    });
    let chatHist = await userData.chatHistory;
    const chatString = chatHist
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");

    // console.log(chatString);

    caseHistory += chatString;
    caseHistory += "NOW GIVE THE SUMMARY";

    let summaryofPatient = userData.patientBasicData;

    const summary = async () => {
      const chatCompletion = await openai2.chat.completions.create({
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
        messages: [
          {
            role: "assistant",
            content:
              chatString +
              "\n\nYou are a charting bot that will be given a patient intake transcription. You are to translate the chat log into thorough medical notes for the physician. Don't divide it into subgroups. Give the string only of important keypoints that the patient having, each element is supposed to be separated by a fullstop(.) and contain under 10 words. Don't add recommendation part. ONLY GENERATE MAXIMUM 7 POINTS AND MINIMUM 3 POINTS. dont add numberings",
          },
        ],
        max_tokens: 750,
      });
      keygenhaha = chatCompletion.choices[0].message.content;
      console.log(keygenhaha);
      let keynoteArr = keygenhaha.split(".");
      console.log(keynoteArr);
      console.log(keynoteArr.length);
      keynoteArr.pop();
      console.log("\n\nkeynotes\n");
      for (let i = 0; i < keynoteArr.length; i++) {
        const element = keynoteArr[i];
        console.log(i + ".\n" + element);
      }
      await db.collection("PatientData").doc(userId).update({
        keynotes: keynoteArr,
      });

      // -------------------------------under diagnosis gen----------------------------------
      const diagnosisChatCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "assistant",
            content:
              chatString +
              "\n\nYou are a charting bot that will be given a patient intake transcription. you just tell us with what dicease or problem the 'under diagnosis' part should be exaplained. give answer carefully as you are now nothing gonna change this in future until it cures, respond with the dicease name or problem name in such a way, that it is globally offical. SEND THE dicease name or problem name ONLY. Don't expose that you are an AI, response will NULL if you are facing problem finding the correct answer.",
          },
        ],
        max_tokens: 100,
      });
      underdiagno = await diagnosisChatCompletion.choices[0].message.content;
      console.log(underdiagno);
      await db.collection("PatientData").doc(userId).update({
        underdiagnosis: underdiagno,
      });
    };

    // await lmaoded();
      // -------------------------------possible outcomes gen----------------------------------


      const diagnosisMD = "# MISSION;\
      You are a medical notes bot that will be given a chart or symptoms for a patient shortly after intake. You will generate a list of the most likely diagnosis or avenues of investigation for the physician to follow up on;\
      # INTERACTION SCHEMA;\
      The USER will give you the medical notes. You will generate a report with the following format;\
      1. <POTENTIAL DIAGNOSIS ALL CAPS>: <Description of the condition, common alternative names, etc>;\
         - DIFFERENTIALS: <Differentials description>;\
         - DEMOGRAPHICS: <Typical demographic of affliction, demographic risk factors>;\
         - SYMPTOMS: <Formal list of symptoms>;\
         - INDICATORS: <Why this patient matches this diagnosis>;\
         - CONTRAINDICATORS: <Why this patient doesn;\'t match this diagnosis>;\
         - PROGNOSIS: <General outlook for condition>;\
         - TREATMENT: <Available treatment options>;\
         - TESTS: <Recommended follow up tests, and what you\'re looking for, probative information desired>;\n\n\
      2. <POTENTIAL DIAGNOSIS ALL CAPS>: <Description of the condition, common alternative names, etc>;\
         - DIFFERENTIALS: <Differentials description>;\
         - DEMOGRAPHICS: <Typical demographic of affliction, demographic risk factors>;\
         - SYMPTOMS: <Formal list of symptoms>;\
         - INDICATORS: <Why this patient matches this diagnosis>;\
         - CONTRAINDICATORS: <Why this patient doesn;\'t match this diagnosis>;\
         - PROGNOSIS: <General outlook for condition>;\
         - TREATMENT: <Available treatment options>;\
         - TESTS: <Recommended follow up tests, and what you\'re looking for, probative information desired>;\
      " 
      const diagnosisMDCompletion = await openai2.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "assistant",
            content:
            diagnosisMD +
            chatString+
            "\n\nNO NEED TO ADD EXTRA STYLING THERE. MAKE EVERY SENTENCE SEPERATED BY SEMICOLON (;)",
          },
        ],
        max_tokens: 1500,
      });
      let diagnosisMDCompletionTest = await diagnosisMDCompletion.choices[0].message.content;
      console.log(diagnosisMDCompletionTest);
      await db.collection("PatientData").doc(userId).update({
        diagnosisMDCompletionTest: diagnosisMDCompletionTest,
      });
      
      
      
      
      const clinicMD = "# MISSION;;\
      You are a medical intake bot. You are preparing for the final step before the medical professional (physician, nurse, PA) evaluates the patient in a clinical setting. You will be given notes from the patient\'s intake as well as system-generated diagnostic avenues of investigation. You are to prepare some clinical recommendations to evaluate the patient. Keep in mind that this is a primary care visit.;;\
      # SENSES;;\
      Sight, sound, smell, touch (palpation) as well as other clinical tests. What senses should the attending medical professional be on the look out for? Given the notes, please be specific and probative in your recommendations. Make sure to explain what to look for as well as why it could be helpful.;;\
      # CLINICAL EXAMINATION;;\
      Please list specific examination techniques that you recommend as well as what to look for and why. Remember that this is strictly for the clinical visit. We will worry about referrals and follow-up later. Focus only on primary care type techniques.;;\
      # INTERVIEW QUESTIONS;;\
      Suggest several questions for the clinician to ask the patient as part of the investigation;;\
      # OUTPUT FORMAT;;\
      Regardless of the input format (you may be given notes, charts, chat logs, etc) your output format must be consistent and use the following:;;\
      ## SENSES;;\
      SIGHT: <What to look for when visually engaging the patient. Explain why this information could be probative.>;;\
      SOUND: <What to listen for when engaging the patient. Explain why this information could be probative.>;;\
      TOUCH: <What physical sensations, if any, to look for when palpating. Explain why this information could be probative.>;;\
      SMELL: <What smells to pay attention to, if any may be relevant. Explain why this information could be probative.>;;\
      ## EXAMINATION;;\
      - <EXAMINATION TECHNIQUE ALL CAPS>: <Description of what to look for and why, e.g. how this exam is probative>;;\
      - <EXAMINATION TECHNIQUE ALL CAPS>: <Description of what to look for and why, e.g. how this exam is probative>;;\
      - <EXAMINATION TECHNIQUE ALL CAPS>: <Description of what to look for and why, e.g. how this exam is probative>;;\
      ## INTERVIEW;;\
      - <PROBATIVE PURPOSE OF QUESTION ALL CAPS>: \"<Suggested question>?\";;\
      - <PROBATIVE PURPOSE OF QUESTION ALL CAPS>: \"<Suggested question>?\";;\
      - <PROBATIVE PURPOSE OF QUESTION ALL CAPS>: \"<Suggested question>?\""
      const clinicMDCompletion = await openai2.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "assistant",
            content:
            clinicMD +
            chatString+
            "\n\nNO NEED TO ADD EXTRA STYLING THERE. MAKE EVERY SENTENCE SEPERATED BY SEMICOLON (;). EVERY SENTENCE IN YOUR RENSPONSE MUST BE SEPERATED BY SEMICOLONS(;)",
          },
        ],
        max_tokens: 1500,
      });
      let clinicMDCompletionTest = await clinicMDCompletion.choices[0].message.content;
      console.log(clinicMDCompletionTest);
      await db.collection("PatientData").doc(userId).update({
        clinicMDCompletionTest: clinicMDCompletionTest,
      });







    await lmaoded();





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
    }

    res.render("allData", {
      allPatientDataToBeRendered,
    });
  } catch (e) {
    console.error(e);
    res.send(e);
  }
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
//   underdiagnosis: "Conjunctivitis"
// }

// db.collection("PatientData").doc(userData.email).set(userData);
