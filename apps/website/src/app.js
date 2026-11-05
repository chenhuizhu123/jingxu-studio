const english = document.documentElement.lang === "en";
const l = english
  ? {
      scenes: [
        "The last bus leaves",
        "A late letter",
        "Stranger in the rain",
        "A three-year secret",
        "The store goes dark",
        "A phone starts ringing",
      ],
      types: ["Long shot", "Close shot", "Medium shot", "Close-up"],
      story: "Letters in the rain / Storyboard draft",
      shot: "Shot",
      action: "Frame & action",
      type: "Framing",
      duration: "Duration",
      refs: "A shared starting point",
      character: "Maya",
      referenceAlt: "Illustrative character reference",
      characterDetails:
        "Dark short hair / grey-green coat<br>Old city / rain / teal palette<br>References linked to the cast in each shot",
      referenceSaved: "✓ Character reference linked",
      versions: "New candidates. Good takes kept.",
      original: "Original sample version",
      next: "New sample candidate",
      current: "Selected",
      newCandidate: "New candidate",
      preserved: "Original version retained",
      compare: "Compare before selecting",
      delivery: "Take the complete story with you",
      video: "Video",
      subtitles: "Subtitles",
      storyboard: "Storyboard",
      package: "Project & assets",
      selectShot: "Choose shot",
      sample: "Sample illustration",
      candidates: "candidates",
      demoCandidate: "Demo candidate",
      use: "Use this version",
      used: "✓ Selected",
      changed: (shot, version) =>
        `Shot ${shot} now uses V${version}. Earlier candidates remain available.`,
      added: (shot, number, selected) =>
        `Shot ${shot}: demo candidate V${number} added. Selected V${selected} is unchanged. No generation model was called.`,
      limit:
        "This demo allows up to 8 candidates per shot. You can still compare and select any version.",
      recordKind: "Local trial requirements",
      download: "Jingxu-Studio-trial-requirements.json",
    }
  : {
      scenes: [
        "末班公交离站",
        "迟到的信",
        "雨中的陌生人",
        "三年前的秘密",
        "便利店熄灯",
        "电话亭响起",
      ],
      types: ["远景", "近景", "中景", "特写"],
      story: "雨夜来信 / 分镜初稿",
      shot: "镜号",
      action: "画面与动作",
      type: "景别",
      duration: "时长",
      refs: "固定参考，共同起点",
      character: "林晚",
      referenceAlt: "角色参考示意",
      characterDetails:
        "深色短发 / 灰绿色风衣<br>旧城 / 雨夜 / 青绿色调<br>参考资产关联到出场镜头",
      referenceSaved: "✓ 已绑定角色参考",
      versions: "候选分开，满意保留",
      original: "原始演示版本",
      next: "新候选演示版本",
      current: "已选",
      newCandidate: "新候选",
      preserved: "原版本保留",
      compare: "比较后再决定",
      delivery: "把作品，完整带走",
      video: "成片",
      subtitles: "字幕",
      storyboard: "分镜",
      package: "项目与素材",
      selectShot: "选择镜头",
      sample: "演示插画",
      candidates: "个候选",
      demoCandidate: "演示候选",
      use: "选用此版",
      used: "✓ 已选用",
      changed: (shot, version) =>
        `镜头 ${shot} 已选用 V${version}。其他候选仍然保留，可以随时回选。`,
      added: (shot, number, selected) =>
        `镜头 ${shot} 新增演示候选 V${number}，当前已选 V${selected} 保持不变。这里未调用生成模型。`,
      limit: "演示每个镜头最多 8 个候选，你可以继续比较与回选。",
      recordKind: "本地试用需求记录",
      download: "镜序-Studio-试用需求.json",
    };
const shots = l.scenes.map((title, i) => ({
  title,
  selected: 1,
  versions: [{ number: 1, scene: (i % 4) + 1, note: "" }],
}));
let active = 2;
const previews = [
  `<h3 class="process-title">${l.story}<span>6 SHOTS</span></h3><table class="story-table"><thead><tr><th>${l.shot}</th><th>${l.action}</th><th>${l.type}</th><th>${l.duration}</th></tr></thead><tbody>${l.scenes
    .slice(0, 4)
    .map(
      (s, i) =>
        `<tr><td>0${i + 1}</td><td>${s}</td><td>${l.types[i]}</td><td>4s</td></tr>`,
    )
    .join("")}</tbody></table>`,
  `<h3 class="process-title">${l.refs}<span>CHARACTER</span></h3><div class="ref-preview"><img src="/assets/scene-1.svg" alt="${l.referenceAlt}"><div><h4>${l.character}</h4><p>${l.characterDetails}</p><small>${l.referenceSaved}</small></div></div>`,
  `<h3 class="process-title">${l.versions}<span>VERSIONS</span></h3><div class="process-versions"><div><img src="/assets/scene-1.svg" alt="${l.original}"><span>V1 · ${l.current}</span><i>${l.preserved}</i></div><div><img src="/assets/scene-3.svg" alt="${l.next}"><span>V2 · ${l.newCandidate}</span><i>${l.compare}</i></div></div>`,
  `<h3 class="process-title">${l.delivery}<span>DELIVERY</span></h3><div class="process-files">${[
    ["rain-r12.mp4", l.video],
    ["subtitles.srt", l.subtitles],
    ["storyboard.csv", l.storyboard],
    ["project.zip", l.package],
  ]
    .map(
      ([name, kind]) => `<div><span>${name}</span><small>${kind}</small></div>`,
    )
    .join("")}</div>`,
];
document.querySelector("#step-content").innerHTML = previews[0];
document.querySelectorAll("[data-step]").forEach((button) =>
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-step]").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    button.classList.add("active");
    button.setAttribute("aria-selected", "true");
    document.querySelector("#step-content").innerHTML =
      previews[Number(button.dataset.step)];
  }),
);
function render() {
  document.querySelector("#demo-shots").innerHTML = shots
    .map(
      (s, i) =>
        `<button class="demo-shot ${i === active ? "active" : ""}" data-shot="${i}" aria-label="${l.selectShot} ${i + 1}"><img src="/assets/scene-${(i % 4) + 1}.svg" alt="${l.sample} ${i + 1}"><span>0${i + 1}</span><div>${s.title}<small>${l.types[i % 4]} · 04s · V${s.selected}</small></div></button>`,
    )
    .join("");
  document.querySelectorAll("[data-shot]").forEach((b) =>
    b.addEventListener("click", () => {
      active = Number(b.dataset.shot);
      render();
    }),
  );
  document.querySelector("#timeline").innerHTML = shots
    .map((s, i) => `<i><img src="/assets/scene-${(i % 4) + 1}.svg" alt=""></i>`)
    .join("");
  const s = shots[active],
    v = s.versions.find((v) => v.number === s.selected);
  document.querySelector("#shot-label").textContent =
    "SHOT " + String(active + 1).padStart(2, "0");
  document.querySelector("#demo-preview").src = `/assets/scene-${v.scene}.svg`;
  document.querySelector("#selected-version").textContent =
    `${l.current} V${s.selected}`;
  document.querySelector("#version-count").textContent =
    `${s.versions.length} ${l.candidates}`;
  document.querySelector("#candidate-list").innerHTML =
    s.versions.length > 1
      ? [...s.versions]
          .reverse()
          .map(
            (v) =>
              `<button data-version="${v.number}"><span>V${v.number} · ${l.demoCandidate}</span><span>${s.selected === v.number ? l.used : l.use}</span></button>`,
          )
          .join("")
      : "";
  document.querySelectorAll("[data-version]").forEach((b) =>
    b.addEventListener("click", () => {
      s.selected = Number(b.dataset.version);
      document.querySelector("#demo-result").textContent = l.changed(
        active + 1,
        s.selected,
      );
      render();
    }),
  );
}
render();
document.querySelector("#create-candidate").addEventListener("click", () => {
  const s = shots[active];
  if (s.versions.length >= 8) {
    document.querySelector("#demo-result").textContent = l.limit;
    return;
  }
  const n = s.versions.length + 1;
  s.versions.push({
    number: n,
    scene: ((active + n) % 4) + 1,
    note: document.querySelector("#repair-note").value,
  });
  document.querySelector("#demo-result").textContent = l.added(
    active + 1,
    n,
    s.selected,
  );
  render();
});
const dialog = document.querySelector("#feedback-dialog");
document.querySelectorAll("[data-trial-feedback]").forEach((button) => {
  button.addEventListener("click", () => dialog.showModal());
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
document.querySelector("#feedback-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const blob = new Blob(
    [
      JSON.stringify(
        {
          product: "Jingxu Studio",
          kind: l.recordKind,
          schemaVersion: 2,
          language: english ? "en" : "zh",
          priceHypothesis: "99 CNY/month",
          ...data,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = l.download;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  dialog.close();
});

// This animates a layout study, never a generated video or paid task.
const motionButton = document.querySelector("#hero-motion");
if (motionButton) {
  const reduced =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (reduced) {
    motionButton.disabled = true;
    motionButton.querySelector("span").textContent = english
      ? "Motion reduced"
      : "已减少动态效果";
  }
  motionButton.addEventListener("click", () => {
    const playing = motionButton.getAttribute("aria-pressed") !== "true";
    motionButton.setAttribute("aria-pressed", String(playing));
    document.querySelector(".hero-art").classList.toggle("is-playing", playing);
    motionButton.querySelector("span").textContent = english
      ? playing
        ? "Pause motion study"
        : "Play motion study"
      : playing
        ? "暂停排版动效"
        : "播放排版动效";
  });
}
const processTabs = [...document.querySelectorAll("[data-step]")];
processTabs.forEach((tab, index) => {
  tab.id = `process-tab-${index}`;
  tab.setAttribute("aria-controls", "process-panel");
  tab.addEventListener("click", () => {
    processTabs.forEach((t) => (t.tabIndex = t === tab ? 0 : -1));
    document
      .querySelector("#process-panel")
      .setAttribute("aria-labelledby", tab.id);
  });
  tab.addEventListener("keydown", (event) => {
    let next = index;
    if (["ArrowDown", "ArrowRight"].includes(event.key))
      next = (index + 1) % processTabs.length;
    else if (["ArrowUp", "ArrowLeft"].includes(event.key))
      next = (index + processTabs.length - 1) % processTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = processTabs.length - 1;
    else return;
    event.preventDefault();
    processTabs[next].click();
    processTabs[next].focus();
  });
  tab.tabIndex = index === 0 ? 0 : -1;
});
document
  .querySelector("#process-panel")
  .setAttribute("aria-labelledby", "process-tab-0");
