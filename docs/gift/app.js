const questions = [
  {
    key: "relation",
    kicker: "먼저, 관계를 살펴볼게요",
    title: "누구에게 전할 마음인가요?",
    help: "가장 가까운 관계를 골라주세요.",
    options: [
      ["friend", "친구·지인", "가깝거나 가끔 연락하는 사이", "人"],
      ["senior", "선배·상사", "학교·직장에서 알게 된 윗사람", "上"],
      ["coworker", "동료·후배", "함께 일하거나 알고 지내는 사이", "同"],
      ["family", "가족·친척", "가족 행사로 자주 만나는 사이", "家"]
    ]
  },
  {
    key: "occasion",
    kicker: "이번에는 상황을 볼게요",
    title: "어떤 계기로 고민 중인가요?",
    help: "첫 버전에서는 가장 흔한 상황을 준비했어요.",
    options: [
      ["birthday", "생일", "기억하고 있다는 마음을 전하고 싶어요", "誕"],
      ["holiday", "명절", "감사와 안부를 함께 전하고 싶어요", "福"],
      ["thanks", "도움에 대한 감사", "신세를 졌거나 고마운 일이 있어요", "謝"],
      ["congrats", "축하할 일", "승진·이직·새로운 시작을 축하해요", "祝"]
    ]
  },
  {
    key: "closeness",
    kicker: "마음의 거리를 알려주세요",
    title: "평소 얼마나 가까운 사이인가요?",
    help: "정답은 없어요. 요즘의 관계를 기준으로 골라주세요.",
    options: [
      ["close", "꽤 가까워요", "사적인 이야기도 편히 나누는 사이", "01"],
      ["regular", "종종 연락해요", "가끔 만나거나 안부를 주고받아요", "02"],
      ["distant", "가끔 생각나는 정도", "일 년에 한두 번 연락하는 사이", "03"],
      ["formal", "예의를 지키는 관계", "주로 업무나 공식적인 자리에서 만나요", "04"]
    ]
  },
  {
    key: "history",
    kicker: "주고받은 마음도 중요해요",
    title: "최근 선물을 받은 적이 있나요?",
    help: "비슷한 상황에서 1~2년 이내에 주고받은 기억을 떠올려 보세요.",
    options: [
      ["received", "받았어요", "상대가 먼저 챙겨준 적이 있어요", "↙"],
      ["mutual", "서로 주고받아요", "자연스럽게 챙기는 사이예요", "↔"],
      ["none", "주고받지 않았어요", "선물이 오간 기억은 없어요", "—"],
      ["unknown", "잘 기억나지 않아요", "애매하거나 오래전 일이에요", "?" ]
    ]
  },
  {
    key: "intent",
    kicker: "이번 마음의 이유를 볼게요",
    title: "선물을 고민하는 가장 큰 이유는요?",
    help: "가장 솔직한 마음에 가까운 답을 골라주세요.",
    options: [
      ["heart", "진심으로 챙기고 싶어서", "기쁜 마음으로 준비하고 싶어요", "♥"],
      ["return", "받은 마음에 답하고 싶어서", "답례하지 않으면 마음에 걸려요", "回"],
      ["relation", "관계를 이어가고 싶어서", "좋은 인연을 계속 만들고 싶어요", "緣"],
      ["pressure", "안 하면 어색할 것 같아서", "예의상 해야 하는지 고민돼요", "…"]
    ]
  },
  {
    key: "budget",
    kicker: "마지막으로 현실적인 범위를 정해요",
    title: "생각해둔 예산이 있나요?",
    help: "결과에서는 관계에 맞춰 조금 다르게 제안할 수 있어요.",
    options: [
      ["under3", "3만원 미만", "가볍고 부담 없는 마음", "₩"],
      ["three5", "3만~5만원", "무난하고 정성스러운 범위", "₩₩"],
      ["five10", "5만~10만원", "조금 더 특별하게", "₩₩₩"],
      ["open", "아직 모르겠어요", "적정 금액부터 추천받고 싶어요", "?" ]
    ]
  }
];

const answers = {};
let currentStep = 0;

const views = [...document.querySelectorAll(".view")];
const stepCurrent = document.getElementById("stepCurrent");
const stepTotal = document.getElementById("stepTotal");
const progressBar = document.getElementById("progressBar");
const questionKicker = document.getElementById("questionKicker");
const questionTitle = document.getElementById("questionTitle");
const questionHelp = document.getElementById("questionHelp");
const optionsArea = document.getElementById("options");
const nextButton = document.getElementById("nextButton");
const backButton = document.getElementById("backButton");
const toast = document.getElementById("toast");

stepTotal.textContent = questions.length;

function showView(id) {
  views.forEach(view => view.classList.toggle("active", view.id === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderQuestion() {
  const question = questions[currentStep];
  stepCurrent.textContent = currentStep + 1;
  progressBar.style.width = `${((currentStep + 1) / questions.length) * 100}%`;
  questionKicker.textContent = question.kicker;
  questionTitle.textContent = question.title;
  questionHelp.textContent = question.help;
  backButton.style.visibility = currentStep === 0 ? "hidden" : "visible";
  nextButton.innerHTML = currentStep === questions.length - 1 ? "결과 확인하기 <span>→</span>" : "다음으로 <span>→</span>";
  nextButton.disabled = !answers[question.key];
  optionsArea.innerHTML = "";

  question.options.forEach(([value, label, detail, icon]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `option${answers[question.key] === value ? " selected" : ""}`;
    button.innerHTML = `<span class="option-icon">${icon}</span><span class="option-copy"><strong>${label}</strong><small>${detail}</small></span>`;
    button.addEventListener("click", () => {
      answers[question.key] = value;
      [...optionsArea.children].forEach(option => option.classList.remove("selected"));
      button.classList.add("selected");
      nextButton.disabled = false;
    });
    optionsArea.appendChild(button);
  });
}

function buildRecommendation() {
  let score = 0;
  if (["close", "regular"].includes(answers.closeness)) score += 2;
  if (answers.closeness === "distant") score -= 1;
  if (answers.closeness === "formal") score -= 1;
  if (answers.history === "received") score += 2;
  if (answers.history === "mutual") score += 3;
  if (answers.history === "none") score -= 1;
  if (["heart", "return"].includes(answers.intent)) score += 2;
  if (answers.intent === "relation") score += 1;
  if (answers.intent === "pressure") score -= 2;
  if (answers.occasion === "thanks") score += 2;
  if (answers.occasion === "holiday" && ["senior", "family"].includes(answers.relation)) score += 1;

  const relationLabel = {
    friend: "지인", senior: "선배", coworker: "동료", family: "가족"
  }[answers.relation];
  const occasionLabel = {
    birthday: "생일", holiday: "명절", thanks: "감사", congrats: "축하"
  }[answers.occasion];

  let decision;
  if (score >= 5) {
    decision = {
      tone: "#315e4d",
      badge: "선물로 마음을 전하기 좋은 때",
      title: "작게라도 챙겨보세요",
      reason: "이미 오간 마음이 있거나 관계가 충분히 가까워요. 비싼 것보다 상대를 생각해 골랐다는 느낌이 중요합니다.",
      headline: "이번에는 선물로\n마음을 전해도 좋아요",
      summary: `${relationLabel}에게 전하는 ${occasionLabel} 마음이라면, 부담스럽지 않은 선물과 짧은 메시지가 관계를 따뜻하게 이어줄 거예요.`
    };
  } else if (score >= 2) {
    decision = {
      tone: "#9a7428",
      badge: "가벼운 표현이 잘 어울리는 때",
      title: "부담 없는 선물이 좋아요",
      reason: "꼭 챙겨야 하는 관계는 아니지만 마음을 표현하면 반가울 상황이에요. 크기보다 자연스러운 명분을 우선하세요.",
      headline: "거창하지 않게,\n가벼운 마음이면 충분해요",
      summary: `${relationLabel}에게 부담을 주지 않도록 작고 소모적인 선물이나 식사 한 번 정도로 표현해 보세요.`
    };
  } else {
    decision = {
      tone: "#536f84",
      badge: "안부만으로도 충분한 때",
      title: "선물하지 않아도 괜찮아요",
      reason: "현재 관계와 선물을 고민하는 이유를 보면, 물건보다 진심 어린 안부가 더 자연스럽습니다. 억지로 준비하지 않아도 예의에 어긋나지 않아요.",
      headline: "이번에는 선물보다\n따뜻한 연락이 어울려요",
      summary: `${relationLabel}에게 짧은 ${occasionLabel} 메시지를 보내는 것만으로도 충분히 마음을 전할 수 있어요.`
    };
  }

  let budget = { title: "3만원 안팎", reason: "받는 사람이 답례를 고민하지 않을 만큼 가벼운 범위가 좋아요." };
  if (score >= 6 && ["close", "mutual"].includes(answers.closeness === "close" ? "close" : answers.history)) {
    budget = { title: "3만~7만원", reason: "가까운 관계에서 특별한 날을 챙기기에 자연스러운 범위예요. 기존에 오간 선물 가격도 함께 고려하세요." };
  }
  if (score <= 1) budget = { title: "0원도 괜찮아요", reason: "메시지나 안부 전화면 충분합니다. 굳이 고른다면 커피 한 잔처럼 1만원대 이하로 가볍게 하세요." };
  if (answers.budget === "under3" && score > 1) budget = { title: "1만~3만원", reason: "처음 생각한 예산이 관계에도 잘 맞아요. 가격보다 포장과 메시지에 신경 써보세요." };
  if (answers.budget === "five10" && score < 5) budget = { title: "3만~5만원으로 낮춰보세요", reason: "현재 관계에서는 5만원을 넘기면 상대가 답례 부담을 느낄 수 있어요." };

  const typesByOccasion = {
    birthday: [
      ["작은 취향", "평소 좋아하는 커피·차·디저트처럼 금방 즐길 수 있는 것"],
      ["선택의 여지", "취향을 모를 때는 사용처가 넓은 2~3만원대 상품권"],
      ["함께하는 시간", "가까운 사이라면 선물 대신 식사나 커피 약속"]
    ],
    holiday: [
      ["나누는 먹거리", "가족과 함께 먹을 수 있는 과일·차·간식 세트"],
      ["실용적인 소모품", "보관이 쉽고 일상에서 자연스럽게 쓰는 생활용품"],
      ["안부 한 상자", "멀리 있다면 배송이 편하고 포장이 단정한 선물"]
    ],
    thanks: [
      ["정중한 먹거리", "포장이 단정하고 여럿이 나누기 좋은 디저트나 차"],
      ["작은 업무 소품", "취향을 덜 타는 필기구나 사무용 소품"],
      ["식사 대접", "직접 만날 수 있다면 물건보다 기억에 남는 한 끼"]
    ],
    congrats: [
      ["새 출발 소품", "새로운 자리에서 가볍게 사용할 수 있는 실용품"],
      ["기분 좋은 먹거리", "축하 자리에 함께 나누기 좋은 케이크나 디저트"],
      ["취향 선택권", "원하는 것을 직접 고를 수 있는 부담 없는 상품권"]
    ]
  };

  const messages = {
    birthday: "생일 진심으로 축하해요. 부담 없이 기분 좋게 즐겨주시면 좋겠습니다. 올해도 좋은 일 많이 생기길 바라요!",
    holiday: "늘 마음 써주셔서 감사합니다. 명절 편안하게 보내시라는 마음으로 작은 것 준비했습니다. 가족분들과 좋은 시간 보내세요.",
    thanks: "그때 도와주신 덕분에 큰 힘이 됐습니다. 감사한 마음을 그냥 지나치고 싶지 않아 작은 것으로 전해요.",
    congrats: "새로운 시작을 진심으로 축하드립니다. 앞으로의 날들이 더 즐겁고 멋지길 바라는 마음으로 준비했어요."
  };

  const cautions = score <= 1
    ? ["미안한 마음 때문에 갑자기 고가 선물을 하는 것", "답례를 기대하는 듯한 표현", "연락 없이 배송부터 보내는 것"]
    : ["향수·의류처럼 취향과 사이즈를 많이 타는 물건", "현재 관계에 비해 지나치게 비싼 선물", "건강 상태를 단정하는 건강식품이나 의료용품"];

  return { decision, budget, types: typesByOccasion[answers.occasion], message: messages[answers.occasion], cautions };
}

function renderResult() {
  const result = buildRecommendation();
  document.getElementById("result").style.setProperty("--result-color", result.decision.tone);
  document.getElementById("resultBadge").textContent = result.decision.badge;
  document.getElementById("resultHeadline").innerHTML = result.decision.headline.replace("\n", "<br>");
  document.getElementById("resultSummary").textContent = result.decision.summary;
  document.getElementById("decisionTitle").textContent = result.decision.title;
  document.getElementById("decisionReason").textContent = result.decision.reason;
  document.getElementById("budgetTitle").textContent = result.budget.title;
  document.getElementById("budgetReason").textContent = result.budget.reason;
  document.getElementById("giftTypes").innerHTML = result.types.map(([title, text]) => `<div class="gift-type"><b>${title}</b><span>${text}</span></div>`).join("");
  document.getElementById("messageText").textContent = `“${result.message}”`;
  document.getElementById("cautionList").innerHTML = result.cautions.map(item => `<li>${item}</li>`).join("");
  showView("result");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

document.getElementById("startButton").addEventListener("click", () => {
  currentStep = 0;
  renderQuestion();
  showView("questionnaire");
});

nextButton.addEventListener("click", () => {
  if (!answers[questions[currentStep].key]) return;
  if (currentStep < questions.length - 1) {
    currentStep += 1;
    renderQuestion();
  } else {
    renderResult();
  }
});

backButton.addEventListener("click", () => {
  if (currentStep > 0) {
    currentStep -= 1;
    renderQuestion();
  }
});

document.getElementById("restartButton").addEventListener("click", () => {
  Object.keys(answers).forEach(key => delete answers[key]);
  currentStep = 0;
  renderQuestion();
  showView("questionnaire");
});

document.getElementById("copyButton").addEventListener("click", async () => {
  const message = document.getElementById("messageText").textContent.replaceAll("“", "").replaceAll("”", "");
  try {
    await navigator.clipboard.writeText(message);
    showToast("문구를 복사했어요");
  } catch {
    showToast("복사하지 못했어요. 문구를 길게 눌러주세요");
  }
});

document.getElementById("shareButton").addEventListener("click", async () => {
  const shareData = {
    title: "드릴까말까",
    text: document.getElementById("resultHeadline").textContent,
    url: location.href
  };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(location.href);
      showToast("결과 링크를 복사했어요");
    }
  } catch (error) {
    if (error.name !== "AbortError") showToast("공유하지 못했어요");
  }
});
