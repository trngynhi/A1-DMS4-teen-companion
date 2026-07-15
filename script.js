const concernOptions={
teen:["puberty","school","stress","friends","family","body image","sleep","self-care","identity","emotions"],
parent:["puberty","school","stress","family","communication","behaviour","sleep","self-care","emotions","friendships"]
};

/*
  Paste your OpenRouter API key between the quotation marks below.
  This is suitable for a university prototype, but a real public app
  should keep the key on a server instead of inside browser JavaScript.
*/
const OPENROUTER_API_KEY = "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";
const OPENROUTER_MODEL = "google/gemma-4-26b-a4b-it:free";
const OPENROUTER_FALLBACK_MODEL = "google/gemma-4-31b-it:free";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

var state={role:"",age:"",concerns:[],companion:null,chatMessages:[]};

var panels=document.querySelectorAll(".step-panel");
var appShell=document.querySelector(".app-shell");

const previousStep={
  role:"landing",
  age:"role",
  concerns:"age",
  transition:"concerns",
  story:"transition",
  loading:"story",
  results:"story"
};

function showStep(name){

  for(var i=0;i<panels.length;i++){
    var p=panels[i];
    var active=p.dataset.step===name;

    p.hidden=!active;

    if(active){
      p.classList.add("is-active");
    }else{
      p.classList.remove("is-active");
    }
  }

  /* ---------- STORY MODE ---------- */

  if(appShell){

    if(
      name==="story" ||
      name==="results"
    ){
      appShell.classList.add("story-mode");
    }else{
      appShell.classList.remove("story-mode");
    }

  }

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });

}

function renderConcernBank(){
  var bank=document.getElementById("concern-bank");
  var zone=document.getElementById("selected-concerns");

  if(!bank||!zone)return;

  bank.innerHTML="";
  state.concerns=[];

  var list=concernOptions[state.role];

  list.forEach(function(label){

    var card=document.createElement("div");
    card.className="paper-card";
    card.textContent=label;
    card.draggable=true;

    card.addEventListener("click",function(){

      if(state.concerns.indexOf(label)!==-1)return;

      if(state.concerns.length>=3){
        alert("maximum 3 concerns");
        return;
      }

      state.concerns.push(label);

      var copy=card.cloneNode(true);
      copy.draggable=false;

      copy.addEventListener("click",function(){

        zone.removeChild(copy);

        state.concerns=state.concerns.filter(function(v){
          return v!==label;
        });

        card.style.background="";

        var ph=zone.querySelector(".drop-placeholder");
        if(ph&&state.concerns.length===0){
          ph.style.display="block";
        }

      });

      zone.appendChild(copy);

      card.style.background="var(--yellow)";

      var ph=zone.querySelector(".drop-placeholder");
      if(ph){
        ph.style.display="none";
      }

    });

    bank.appendChild(card);

  });

}

function getStoryResponses(){

  return {
    recentFeelings:document.getElementById("story-input-1").value.trim(),
    strongerFeelings:document.getElementById("story-input-2").value.trim(),
    importantToKnow:document.getElementById("story-input-3").value.trim()
  };

}

function buildCompanionMessages(){

  var storyResponses=getStoryResponses();

  var systemPrompt=[
    "You are a supportive wellbeing companion for teenagers.",
    "Never diagnose, shame, or give medical advice.",
    "Never replace professional help.",
    "Do not sound like ChatGPT or a therapist.",
    "Use warm, calm, friendly, age-appropriate language.",
    "Encourage healthy, realistic next steps.",
    "Return only valid JSON with exactly these keys: noticed, encouragement, nextStep.",
    "Each value must be a natural, short paragraph of roughly 40–80 words.",
    "Do not use markdown, headings, bullet points, or extra keys."
  ].join(" ");

  var userPrompt=[
    "Create a personalised companion response using this survey information:",
    "User role: "+state.role,
    "User age: "+state.age,
    "Selected concerns: "+state.concerns.join(", "),
    "Story response 1 (what life has felt like recently): "+(storyResponses.recentFeelings||"No response provided."),
    "Story response 2 (what makes those feelings stronger): "+(storyResponses.strongerFeelings||"No response provided."),
    "Story response 3 (what the companion should understand): "+(storyResponses.importantToKnow||"No response provided."),
    "Return JSON in exactly this shape: {\"noticed\":\"\",\"encouragement\":\"\",\"nextStep\":\"\"}."
  ].join("\n");

  return [
    {role:"system",content:systemPrompt},
    {role:"user",content:userPrompt}
  ];

}

async function requestCompanion(model,messages){

  var response=await fetch(OPENROUTER_ENDPOINT,{
    method:"POST",
    headers:{
      "Authorization":"Bearer "+OPENROUTER_API_KEY,
      "Content-Type":"application/json",
      "X-OpenRouter-Title":"Teen Companion Prototype"
    },
    body:JSON.stringify({
      model:model,
      messages:messages,
      temperature:0.7,
      max_tokens:500
    })
  });

  var data={};

  try{
    data=await response.json();
  }catch(error){
    data={};
  }


  if(!response.ok){
    var apiMessage=data.error&&data.error.message
      ? data.error.message
      : "OpenRouter returned an error.";

    var requestError=new Error(apiMessage);
    requestError.status=response.status;
    throw requestError;
  }

  return data;

}

function getAssistantContent(data){

  var content=data.choices&&data.choices[0]&&data.choices[0].message
    ? data.choices[0].message.content
    : "";

  if(Array.isArray(content)){
    content=content.map(function(part){
      return typeof part==="string" ? part : (part.text||"");
    }).join("");
  }

  return typeof content==="string" ? content : "";

}

function parseCompanionResponse(data){

  var content=getAssistantContent(data);

  if(!content.trim()){
    throw new Error("The companion response was empty.");
  }

  var cleaned=content.trim()
    .replace(/^```(?:json)?\s*/i,"")
    .replace(/\s*```$/i,"")
    .trim();

  var firstBrace=cleaned.indexOf("{");
  var lastBrace=cleaned.lastIndexOf("}");

  if(firstBrace!==-1&&lastBrace!==-1){
    cleaned=cleaned.slice(firstBrace,lastBrace+1);
  }

  var companion=JSON.parse(cleaned);
  var fields=["noticed","encouragement","nextStep"];

  fields.forEach(function(field){
    if(typeof companion[field]!=="string"||!companion[field].trim()){
      throw new Error("The companion response did not contain all required fields.");
    }
  });

  return companion;

}

async function generateCompanion(){

  var messages=buildCompanionMessages();

  try{
    return parseCompanionResponse(
      await requestCompanion(OPENROUTER_MODEL,messages)
    );
  }catch(error){
    var retryableStatus=[404,429,500,502,503,504];

    if(retryableStatus.indexOf(error.status)===-1){
      throw error;
    }

    return parseCompanionResponse(
      await requestCompanion(OPENROUTER_FALLBACK_MODEL,messages)
    );
  }

}

function buildChatMessages(){

  var companion=state.companion||{};
  var systemPrompt=[
    "You are a warm, supportive wellbeing companion for a teenager.",
    "Never diagnose, shame, or give medical advice.",
    "Never replace professional help.",
    "Use calm, friendly, age-appropriate, conversational language.",
    "Sound like a gentle companion, not an interviewer, therapist, or chatbot.",
    "Aim for roughly 70% reassurance or practical advice and 30% open-ended questions.",
    "Do not end every response with a question; many replies should end with reassurance, encouragement, or a practical next step.",
    "Acknowledge the user's feelings briefly, then move naturally into a helpful explanation or practical next step.",
    "Ask no more than one follow-up question in a response, and only ask it when it genuinely helps continue the conversation or more information is needed.",
    "Never ask two or more questions in the same response, even if they are phrased as separate sentences.",
    "Vary the flow naturally: some replies should only validate, some should offer advice, and some should gently invite the user to continue.",
    "Avoid repeating the same reassurance or sounding like a textbook. Use natural, human, conversational wording.",
    "When the user seems satisfied or says thank you, respond with gentle encouragement and an open invitation to chat again without asking another question.",
    "Avoid repeatedly ending with phrases such as How does that make you feel, What do you think, or Would you like to tell me more.",
    "Vary your openings instead of repeating the same phrase. You may use phrases such as Thanks for sharing that with me, That sounds really difficult, I'm glad you brought that up, A lot of teenagers wonder about this, or That makes sense.",
    "Keep replies about 15–20% shorter than a typical response: around 2–3 short paragraphs and usually 32–65 words.",
    "Keep the conversation calm, patient, and supportive rather than like an interview or questionnaire.",
    "If the user may be unsafe or in immediate danger, encourage them to contact a trusted person or local emergency services.",
    "The user's age is "+state.age+" and their selected concerns are "+state.concerns.join(", ")+".",
    "The first companion notes were: "+(companion.noticed||"")+" "+(companion.encouragement||"")+" "+(companion.nextStep||"")
  ].join(" ");

  return [{role:"system",content:systemPrompt}].concat(state.chatMessages);

}

async function generateChatReply(){

  var messages=buildChatMessages();

  try{
    return getAssistantContent(
      await requestCompanion(OPENROUTER_MODEL,messages)
    ).trim();
  }catch(error){
    var retryableStatus=[404,429,500,502,503,504];

    if(retryableStatus.indexOf(error.status)===-1){
      throw error;
    }

    return getAssistantContent(
      await requestCompanion(OPENROUTER_FALLBACK_MODEL,messages)
    ).trim();
  }

}

function getConcernLabel(concern){

  return concern==="friends" ? "friendships" : concern;

}

function formatConcernList(){

  var labels=state.concerns.map(getConcernLabel);

  if(labels.length===0)return "the things on your mind";
  if(labels.length===1)return labels[0];
  if(labels.length===2)return labels[0]+" and "+labels[1];

  return labels.slice(0,-1).join(", ")+", and "+labels[labels.length-1];

}

function buildOpeningMessages(){

  var concernsText=formatConcernList();
  var storyResponses=getStoryResponses();
  var companion=state.companion||{};

  var systemPrompt=[
    "You are continuing a personalised Teen Companion conversation, not starting a generic chatbot session.",
    "Write only one warm opening message, with no JSON, markdown, headings, or quotation marks.",
    "Explicitly and naturally mention the selected concerns: "+concernsText+".",
    "Acknowledge that the user already shared these concerns during onboarding.",
    "Invite them to continue with one concern that feels most important right now.",
    "Use a calm, gentle, age-appropriate, non-judgmental tone.",
    "Do not diagnose, shame, give medical advice, or sound like a therapist.",
    "Keep it to roughly 40–80 words."
  ].join(" ");

  var userPrompt=[
    "Here is the onboarding context:",
    "Role: "+state.role,
    "Age: "+state.age,
    "Selected concerns: "+concernsText,
    "What life has felt like recently: "+(storyResponses.recentFeelings||"No response provided."),
    "What makes those feelings stronger: "+(storyResponses.strongerFeelings||"No response provided."),
    "What the companion should understand: "+(storyResponses.importantToKnow||"No response provided."),
    "The generated companion notes were: "+(companion.noticed||"")+" "+(companion.encouragement||"")+" "+(companion.nextStep||""),
    "Write the first chat message now."
  ].join("\n");

  return [
    {role:"system",content:systemPrompt},
    {role:"user",content:userPrompt}
  ];

}

function cleanChatText(text){

  return text.trim()
    .replace(/^```(?:text)?\s*/i,"")
    .replace(/\s*```$/i,"")
    .replace(/^"|"$/g,"")
    .trim();

}

async function generateChatOpening(){

  var messages=buildOpeningMessages();

  try{
    return cleanChatText(
      getAssistantContent(await requestCompanion(OPENROUTER_MODEL,messages))
    );
  }catch(error){
    var retryableStatus=[404,429,500,502,503,504];

    if(retryableStatus.indexOf(error.status)===-1){
      throw error;
    }

    return cleanChatText(
      getAssistantContent(await requestCompanion(OPENROUTER_FALLBACK_MODEL,messages))
    );
  }

}

function buildFallbackOpening(){

  var concernsText=formatConcernList();

  if(state.concerns.indexOf("sleep")!==-1){
    return "You mentioned that sleep has been difficult lately, along with "+concernsText+". Many people notice that poor sleep can make everything else feel heavier. Has anything been making it especially hard to rest recently?";
  }

  if(state.concerns.indexOf("friends")!==-1||state.concerns.indexOf("friendships")!==-1){
    return "Earlier you mentioned "+concernsText+". Friendships can change a lot during the teenage years, and it can help to talk through what is happening. Has anything connected to your friendships been on your mind recently?";
  }

  if(state.concerns.indexOf("puberty")!==-1){
    return "You mentioned puberty earlier, alongside "+concernsText+". Growing up can bring lots of physical and emotional changes, and everyone's experience is different. Is there anything you have been wondering about or experiencing recently?";
  }

  return "Thanks for sharing those concerns with me earlier. I remember you mentioned "+concernsText+". They can all affect one another, and we do not have to unpack everything at once. Which one has been on your mind the most this week?";

}

function appendChatMessage(role,text){

  var messages=document.getElementById("chat-messages");
  if(!messages)return;

  var message=document.createElement("div");
  message.className="chat-message "+role;
  message.textContent=text;
  messages.appendChild(message);
  messages.scrollTop=messages.scrollHeight;

}

function renderCompanion(companion){

  var grid=document.getElementById("result-grid");
  var summary=document.getElementById("results-summary");

  state.companion=companion;
  state.chatMessages=[];

  if(summary){
    summary.textContent="based on: "+state.concerns.join(", ");
  }

  if(!grid)return;

  grid.innerHTML="";

  [
    ["what we noticed",companion.noticed],
    ["you're not alone",companion.encouragement],
    ["next step",companion.nextStep]
  ].forEach(function(item){

    var card=document.createElement("article");
    var heading=document.createElement("h3");
    var paragraph=document.createElement("p");

    card.className="result-card";
    heading.textContent=item[0];
    paragraph.textContent=item[1];

    card.appendChild(heading);
    card.appendChild(paragraph);
    grid.appendChild(card);

  });

}

document.addEventListener("DOMContentLoaded",function(){

  showStep("landing");

  var start=document.querySelector("[data-action='start']");
  if(start){
    start.addEventListener("click",function(){
      showStep("role");
    });
  }

  var roles=document.querySelectorAll("[data-role]");
  roles.forEach(function(btn){

    btn.addEventListener("click",function(){

      state.role=btn.dataset.role;

      renderConcernBank();

      showStep("age");

    });

  });

  var ageForm=document.getElementById("age-form");

  if(ageForm){

    ageForm.addEventListener("submit",function(e){

      e.preventDefault();

      state.age=document.getElementById("age-input").value;

      showStep("concerns");

    });

  }

  var cont=document.querySelector("[data-action='continue-story']");

  if(cont){

    cont.addEventListener("click",function(){

      if(state.concerns.length===0){
        alert("choose at least one concern");
        return;
      }

      showStep("transition");

    });

  }

  var story=document.querySelector("[data-action='start-story']");

  if(story){

    story.addEventListener("click",function(){

      showStep("story");

    });

  }

  var gen=document.getElementById("generate-companion");

  if(gen){

    gen.addEventListener("click",async function(){

      if(!OPENROUTER_API_KEY||OPENROUTER_API_KEY==="PASTE_YOUR_NEW_UNREVOKED_OPENROUTER_API_KEY_HERE"){
        alert("Add your OpenRouter API key in script.js before creating a companion.");
        return;
      }

      gen.disabled=true;
      showStep("loading");

      try{
        var companion=await generateCompanion();

        renderCompanion(companion);
        showStep("results");
      }catch(error){
        console.error("Companion generation failed:",error);
        showStep("story");
        alert("We couldn't create your companion right now. Please try again in a moment.\n\nDetails: "+(error.message||"Unknown error."));
      }finally{
        gen.disabled=false;
      }

    });

  }

  var startChatting=document.querySelector("[data-action='start-chatting']");
  var chatPanel=document.getElementById("chat-panel");
  var chatForm=document.getElementById("chat-form");
  var chatInput=document.getElementById("chat-input");
  var chatStatus=document.getElementById("chat-status");
  var chatSend=chatForm ? chatForm.querySelector("button[type='submit']") : null;
  var chatSending=false;

  if(startChatting&&chatPanel&&chatForm&&chatInput){

    startChatting.addEventListener("click",async function(){

      if(chatSending)return;

      chatPanel.hidden=false;

      if(state.chatMessages.length===0){
        chatSending=true;
        startChatting.disabled=true;

        if(chatStatus){
          chatStatus.textContent="creating a personal opening...";
          chatStatus.hidden=false;
        }

        var opening="";

        try{
          opening=await generateChatOpening();
        }catch(error){
          console.error("Chat opening request failed:",error);
        }

        if(!opening){
          opening=buildFallbackOpening();
        }

        state.chatMessages.push({role:"assistant",content:opening});
        appendChatMessage("assistant",opening);

        chatSending=false;
        startChatting.disabled=false;

        if(chatStatus)chatStatus.hidden=true;
      }

      chatPanel.scrollIntoView({behavior:"smooth",block:"start"});
      chatInput.focus();

    });

    chatForm.addEventListener("submit",async function(e){

      e.preventDefault();

      if(chatSending)return;

      var userMessage=chatInput.value.trim();
      if(!userMessage)return;

      chatSending=true;
      chatInput.value="";
      state.chatMessages.push({role:"user",content:userMessage});
      appendChatMessage("user",userMessage);

      if(chatStatus){
        chatStatus.textContent="thinking...";
        chatStatus.hidden=false;
      }
      if(chatSend)chatSend.disabled=true;

      try{
        var reply=await generateChatReply();

        if(!reply){
          throw new Error("The chat response was empty.");
        }

        state.chatMessages.push({role:"assistant",content:reply});
        appendChatMessage("assistant",reply);
      }catch(error){
        console.error("Chat request failed:",error);
        appendChatMessage("assistant","I'm having trouble connecting right now. Please try sending that again in a moment.");
      }finally{
        chatSending=false;
        if(chatStatus)chatStatus.hidden=true;
        if(chatSend)chatSend.disabled=false;
        chatInput.focus();
      }

    });

  }

  /* ---------- BACK BUTTON ---------- */

  var backButtons=document.querySelectorAll("[data-action='back']");

  backButtons.forEach(function(btn){

    btn.addEventListener("click",function(){

      var current=document.querySelector(".step-panel.is-active");

      if(!current)return;

      var currentStep=current.dataset.step;

      var prev=previousStep[currentStep];

      if(prev){
        showStep(prev);
      }

    });

  });

  /* ---------- RESTART ---------- */

  var restart=document.querySelector("[data-action='restart']");

  if(restart){

    restart.addEventListener("click",function(){

      location.reload();

    });

  }

});
