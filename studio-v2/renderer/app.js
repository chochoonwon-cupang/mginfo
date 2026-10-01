const SITE_PAGE_SIZE = 30;

const state = {
  draftId: "",
  drafts: [],
  sites: [],
  sitePage: 1,
  editingDomain: "",
  config: {},
  offLog: null,
};

function $(id) {
  return document.getElementById(id);
}

function setStatus(text, isError) {
  const el = $("status");
  el.textContent = text || "";
  el.style.color = isError ? "#f0a0a0" : "";
}

function parseKeywords(raw) {
  return String(raw || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyVendorGroup() {
  return {
    label: "",
    regions: "",
    name: "",
    phone: "",
    address: "",
    businessNumber: "",
    kakao: "",
    email: "",
    ceo: "",
  };
}

function vendorGroupField(label, key, value, placeholder, type = "text") {
  const id = `vg-${key}-${Math.random().toString(36).slice(2, 8)}`;
  return `<div class="vg-field"><label for="${id}">${label}</label><input id="${id}" data-vg-key="${key}" type="${type}" value="${escapeAttr(
    value || ""
  )}" placeholder="${escapeAttr(placeholder || "")}" /></div>`;
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function renderVendorGroups(groups) {
  const list = $("vendorGroupsList");
  if (!list) return;
  const rows = groups?.length ? groups : [emptyVendorGroup()];
  list.innerHTML = "";
  rows.forEach((g, index) => {
    const card = document.createElement("div");
    card.className = "vendor-group-card";
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="vendor-group-card-head">
        <strong>그룹 ${index + 1}</strong>
        <button type="button" class="btn sm danger btn-remove-vendor-group" data-index="${index}">삭제</button>
      </div>
      <div class="grid-2">
        ${vendorGroupField("그룹 이름", "label", g.label, "예: A업체 (서부)")}
        ${vendorGroupField("지역 키워드", "regions", g.regions, "쉼표 구분 · 부천, 시흥, 인천")}
        ${vendorGroupField("업체명", "name", g.name, "주식회사 인포씨에스")}
        ${vendorGroupField("전화", "phone", g.phone, "0000-0000")}
        ${vendorGroupField("사업자등록번호", "businessNumber", g.businessNumber, "224-87-00683")}
        ${vendorGroupField("카카오", "kakao", g.kakao, "선택")}
        ${vendorGroupField("이메일", "email", g.email, "선택")}
        ${vendorGroupField("대표", "ceo", g.ceo, "선택")}
      </div>
      ${vendorGroupField("주소", "address", g.address, "비우면 키워드별 시·구·동 자동")}
    `;
    list.appendChild(card);
  });
  list.querySelectorAll(".btn-remove-vendor-group").forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.index);
      const next = readVendorGroupsFromDom();
      next.splice(idx, 1);
      renderVendorGroups(next.length ? next : [emptyVendorGroup()]);
    };
  });
}

function readVendorGroupsFromDom() {
  const list = $("vendorGroupsList");
  if (!list) return [];
  const cards = [...list.querySelectorAll(".vendor-group-card")];
  return cards
    .map((card) => {
      const row = emptyVendorGroup();
      card.querySelectorAll("[data-vg-key]").forEach((input) => {
        const key = input.getAttribute("data-vg-key");
        if (key && key in row) row[key] = input.value.trim();
      });
      return row;
    })
    .filter((g) => g.label || g.regions || g.name || g.phone);
}

async function vendorGroupsFromDraft(draft) {
  if (Array.isArray(draft?.vendorGroups) && draft.vendorGroups.length) {
    return draft.vendorGroups.map((g) => ({
      label: g.label || g.id || "",
      regions: Array.isArray(g.regions) ? g.regions.join(", ") : String(g.regions || ""),
      name: g.name || "",
      phone: g.phone || "",
      address: g.address || "",
      businessNumber: g.businessNumber || "",
      kakao: g.kakao || "",
      email: g.email || "",
      ceo: g.ceo || "",
    }));
  }
  const text = String(draft?.vendorGroupsText || "").trim();
  if (text && window.brandStudio.parseVendorGroupsText) {
    const parsed = await window.brandStudio.parseVendorGroupsText(text);
    return (parsed || []).map((g) => ({
      label: g.label || g.id || "",
      regions: (g.regions || []).join(", "),
      name: g.name || "",
      phone: g.phone || "",
      address: g.address || "",
      businessNumber: g.businessNumber || "",
      kakao: g.kakao || "",
      email: g.email || "",
      ceo: g.ceo || "",
    }));
  }
  return [];
}

function collectPayload() {
  return {
    id: state.draftId || undefined,
    title: $("title").value.trim(),
    apexDomain: $("apexDomain").value.trim(),
    keywords: parseKeywords($("keywords").value),
    siteTheme: $("siteTheme").value || "random",
    designId: $("designId").value,
    imageFolderUrl: $("imageFolderUrl").value.trim(),
    prompt: $("prompt").value.trim(),
    seoTitleSuffix: $("seoTitleSuffix").value.trim(),
    naverId: $("naverId").value.trim(),
    naverPassword: $("naverPassword").value.trim(),
    naverSiteVerification: $("naverSiteVerification").value.trim(),
    naverMetaMap: $("naverMetaMap").value,
    vendorGroups: readVendorGroupsFromDom(),
    useGeminiEnrich: Boolean($("useGeminiEnrich")?.checked),
    vendor: {
      name: $("vendorName").value.trim(),
      phone: $("vendorPhone").value.trim(),
      kakao: $("vendorKakao").value.trim(),
      address: $("vendorAddress").value.trim(),
      businessNumber: $("vendorBiz").value.trim(),
    },
    mainLanding: {
      enabled: true,
      designId: $("designId").value,
      vendor: {
        name: $("vendorName").value.trim(),
        keyword: "",
        phone: $("vendorPhone").value.trim(),
        kakao: $("vendorKakao").value.trim(),
        address: $("vendorAddress").value.trim(),
        businessNumber: $("vendorBiz").value.trim(),
        industry: "두피문신",
        region: "",
        intro: "",
        website: "",
        strengths: "",
      },
      imageFolderUrl: $("imageFolderUrl").value.trim(),
      slots: {},
      prompt: $("prompt").value.trim(),
      seoTitleSuffix: $("seoTitleSuffix").value.trim(),
      variationSeed: "",
    },
  };
}

function fillForm(draft) {
  state.draftId = draft?.id || "";
  $("title").value = draft?.title || "";
  $("apexDomain").value = draft?.apexDomain || "";
  $("keywords").value = (draft?.keywords || []).join("\n");
  $("siteTheme").value = draft?.siteTheme || "random";
  const ml = draft?.mainLanding || {};
  const vendor = ml.vendor || {};
  $("designId").value = ml.designId === "brand-landing-v1" ? "scalp-tattoo-v1" : ml.designId || "scalp-tattoo-v1";
  $("vendorName").value = vendor.name || "";
  $("vendorPhone").value = vendor.phone || "";
  $("vendorKakao").value = vendor.kakao || "";
  $("vendorAddress").value = vendor.address || "";
  $("vendorBiz").value = vendor.businessNumber || "";
  $("prompt").value = ml.prompt || "";
  $("seoTitleSuffix").value = ml.seoTitleSuffix || draft?.seoTitleSuffix || "";
  $("imageFolderUrl").value = ml.imageFolderUrl || "";
  $("naverId").value = draft?.naverId || "";
  $("naverPassword").value = draft?.naverPassword || "";
  $("naverSiteVerification").value = draft?.naverSiteVerification || "";
  $("naverMetaMap").value = draft?.naverMetaMap || "";
  if ($("useGeminiEnrich")) $("useGeminiEnrich").checked = Boolean(draft?.useGeminiEnrich);
  vendorGroupsFromDraft(draft).then((groups) => {
    renderVendorGroups(groups.length ? groups : [emptyVendorGroup()]);
  });
}

const btnAddVendorGroup = $("btn-add-vendor-group");
if (btnAddVendorGroup) {
  btnAddVendorGroup.onclick = () => {
    const next = readVendorGroupsFromDom();
    next.push(emptyVendorGroup());
    renderVendorGroups(next);
  };
}

function renderPreviews(rows) {
  const body = $("preview-body");
  body.innerHTML = "";
  for (const row of rows || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.keyword}</td><td>${row.host}</td><td>${row.punycode}</td>`;
    body.appendChild(tr);
  }
}

function renderSites() {
  const list = $("site-list");
  const pager = $("site-pager");
  const countEl = $("site-count");
  list.innerHTML = "";
  pager.innerHTML = "";

  const total = state.sites.length;
  if (!total) {
    if (countEl) countEl.textContent = "";
    list.innerHTML = "<li>아직 발행된 사이트가 없습니다.</li>";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(total / SITE_PAGE_SIZE));
  if (state.sitePage > totalPages) state.sitePage = totalPages;
  if (state.sitePage < 1) state.sitePage = 1;

  const start = (state.sitePage - 1) * SITE_PAGE_SIZE;
  const pageRows = state.sites.slice(start, start + SITE_PAGE_SIZE);
  if (countEl) {
    countEl.textContent = `전체 ${total}개 · ${state.sitePage}/${totalPages}페이지 (페이지당 ${SITE_PAGE_SIZE}개)`;
  }

  for (const site of pageRows) {
    const li = document.createElement("li");
    li.innerHTML = `<div><strong>${site.keyword || site.siteName}</strong><br/><small>${site.domain} · ${site.siteTheme} · ${site.designId}${site.address ? ` · ${site.address}` : ""}${site.naverId ? ` · 네이버 ${site.naverId}` : ""}${site.naverSiteVerification ? " · 메타✓" : ""}</small></div>`;
    const actions = document.createElement("div");
    actions.className = "site-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "btn";
    editBtn.type = "button";
    editBtn.textContent = "수정";
    editBtn.onclick = () => openSiteEdit(site);
    actions.appendChild(editBtn);
    if (site.siteUrl) {
      const openBtn = document.createElement("button");
      openBtn.className = "btn";
      openBtn.type = "button";
      openBtn.textContent = "열기";
      openBtn.onclick = () => window.brandStudio.open(site.siteUrl);
      actions.appendChild(openBtn);
    }
    li.appendChild(actions);
    list.appendChild(li);
  }

  if (totalPages <= 1) return;

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "pager-btn";
  prev.textContent = "이전";
  prev.disabled = state.sitePage <= 1;
  prev.onclick = () => {
    state.sitePage -= 1;
    renderSites();
  };
  pager.appendChild(prev);

  for (let p = 1; p <= totalPages; p += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pager-btn${p === state.sitePage ? " is-active" : ""}`;
    btn.textContent = String(p);
    btn.onclick = () => {
      state.sitePage = p;
      renderSites();
    };
    pager.appendChild(btn);
  }

  const next = document.createElement("button");
  next.type = "button";
  next.className = "pager-btn";
  next.textContent = "다음";
  next.disabled = state.sitePage >= totalPages;
  next.onclick = () => {
    state.sitePage += 1;
    renderSites();
  };
  pager.appendChild(next);
}

function openSiteEdit(site) {
  state.editingDomain = site.domain || site.id || "";
  $("site-edit").hidden = false;
  $("site-edit-title").textContent = `${site.keyword || site.siteName} · ${site.domain}`;
  $("edit-naver-meta").value = site.naverSiteVerification || "";
  $("edit-naver-id").value = site.naverId || "";
  $("edit-naver-pw").value = site.naverPassword || "";
  $("edit-address").value = site.address || "";
  $("edit-site-theme").value = site.siteTheme || "folio";
  $("site-edit-status").textContent = "";
  $("site-edit").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeSiteEdit() {
  state.editingDomain = "";
  $("site-edit").hidden = true;
  $("site-edit-status").textContent = "";
}

$("btn-cancel-site").onclick = () => closeSiteEdit();

$("btn-save-site").onclick = async () => {
  if (!state.editingDomain) return;
  $("site-edit-status").textContent = "저장 중…";
  $("site-edit-status").style.color = "";
  try {
    const res = await window.brandStudio.updateSite({
      domain: state.editingDomain,
      naverSiteVerification: $("edit-naver-meta").value,
      naverId: $("edit-naver-id").value,
      naverPassword: $("edit-naver-pw").value,
      address: $("edit-address").value,
      siteTheme: $("edit-site-theme").value,
    });
    state.sites = res.sites || [];
    renderSites();
    $("site-edit-status").textContent = res.applied
      ? "저장했고 라이브 사이트에도 반영했습니다."
      : "로컬 대장에 저장했습니다. (라이브 반영은 마스터 비번·사이트 URL 확인)";
  } catch (err) {
    $("site-edit-status").textContent = err.message;
    $("site-edit-status").style.color = "#f0a0a0";
  }
};

function appendLog(line) {
  const el = $("publish-log");
  el.textContent += `${line}\n`;
  el.scrollTop = el.scrollHeight;
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("show"));
    btn.classList.add("active");
    $(`view-${btn.dataset.view}`).classList.add("show");
  });
});

$("btn-preview").onclick = async () => {
  try {
    const rows = await window.brandStudio.preview({
      apexDomain: $("apexDomain").value,
      keywords: parseKeywords($("keywords").value),
    });
    renderPreviews(rows);
    setStatus(`미리보기 ${rows.length}건`);
  } catch (err) {
    setStatus(err.message, true);
  }
};

$("btn-save-draft").onclick = async () => {
  try {
    const res = await window.brandStudio.saveDraft(collectPayload());
    state.drafts = res.drafts || [];
    state.draftId = res.draft?.id || state.draftId;
    setStatus("초안 저장됨");
  } catch (err) {
    setStatus(err.message, true);
  }
};

$("btn-publish").onclick = async () => {
  const payload = collectPayload();
  if (!payload.apexDomain || !payload.keywords.length) {
    setStatus("apex와 키워드를 입력하세요.", true);
    return;
  }
  if (!confirm(`${payload.keywords.length}개 사이트를 발행할까요?\n(키워드마다 내용·색이 조금씩 달라집니다)`)) return;
  $("btn-publish").disabled = true;
  $("publish-log").textContent = "";
  setStatus("발행 중…");
  if (state.offLog) state.offLog();
  state.offLog = window.brandStudio.onLog((msg) => appendLog(msg));
  try {
    const res = await window.brandStudio.publishBatch(payload);
    state.sites = res.sites || [];
    renderSites();
    const ok = (res.results || []).filter((r) => r.ok).length;
    const fail = (res.results || []).filter((r) => !r.ok).length;
    setStatus(`완료: 성공 ${ok} · 실패 ${fail}`);
    await window.brandStudio.saveDraft(payload);
  } catch (err) {
    setStatus(err.message, true);
    appendLog(`ERROR ${err.message}`);
  } finally {
    $("btn-publish").disabled = false;
  }
};

$("btn-save-settings").onclick = async () => {
  try {
    const res = await window.brandStudio.saveSettings({
      token: $("token").value,
      teamId: $("teamId").value,
      repo: $("repo").value,
      opsHubUrl: $("opsHubUrl").value,
      opsMasterPassword: $("opsMasterPassword").value,
      deploymentProtectionBypass: $("deploymentProtectionBypass").value,
      geminiApiKey: $("geminiApiKey").value,
      geminiModel: $("geminiModel").value,
    });
    state.config = res.config || {};
    if (res.rescuedGeminiKey) {
      $("settings-status").textContent =
        "설정 저장됨 — 모델 칸에 있던 값을 API 키로 옮겨 저장했습니다.";
    } else if (state.config.hasGeminiKey) {
      $("settings-status").textContent = "설정 저장됨 (제미나이 키 포함)";
    } else {
      $("settings-status").textContent =
        "설정 저장됨 · 제미나이 키 없음 — 위 Gemini API Key 칸에 AIza/AQ. 키를 넣고 다시 저장하세요.";
    }
    $("settings-status").style.color = "";
    $("token").value = "";
    $("token").placeholder = state.config.hasToken ? "저장됨 · 바꾸려면 새 토큰 입력" : "vercel_ 로 시작하는 토큰";
    $("geminiApiKey").value = "";
    $("geminiApiKey").placeholder = state.config.hasGeminiKey
      ? "저장됨 · 바꾸려면 새 키 입력"
      : "AIza… 또는 AQ.… 로 시작하는 API 키";
    $("geminiModel").value = state.config.geminiModel || "";
    if (res.rescuedGeminiKey) $("geminiModel").value = "";
  } catch (err) {
    $("settings-status").textContent = err.message;
    $("settings-status").style.color = "#f0a0a0";
  }
};

$("btn-verify").onclick = async () => {
  try {
    const info = await window.brandStudio.verifyToken();
    $("settings-status").textContent = `확인됨: ${info.name || info.username}`;
    $("settings-status").style.color = "";
  } catch (err) {
    $("settings-status").textContent = err.message;
    $("settings-status").style.color = "#f0a0a0";
  }
};

const btnApplyVendorGroups = $("btn-apply-vendor-groups");
if (btnApplyVendorGroups) {
  btnApplyVendorGroups.onclick = async () => {
    try {
      const res = await window.brandStudio.applyVendorGroups(collectPayload());
      setStatus(
        `업체 그룹 ${res.count || 0}개 저장 · ${res.hostsUpdated || 0}개 도메인 메인에 반영했습니다.`
      );
    } catch (err) {
      setStatus(err.message, true);
    }
  };
}

const btnClearSites = $("btn-clear-sites");
if (btnClearSites) {
  btnClearSites.onclick = async () => {
    if (!state.sites.length) {
      setStatus("발행 대장이 이미 비어 있습니다.");
      return;
    }
    if (!confirm(`발행 대장 ${state.sites.length}개 항목을 모두 삭제할까요?\n(Vercel·사이트 자체는 삭제되지 않습니다)`)) return;
    try {
      const res = await window.brandStudio.clearSites();
      state.sites = res.sites || [];
      state.sitePage = 1;
      $("site-edit").hidden = true;
      renderSites();
      setStatus("발행 대장을 비웠습니다.");
    } catch (err) {
      setStatus(err.message, true);
    }
  };
}

const vercelLink = $("link-vercel-tokens");
if (vercelLink) {
  vercelLink.addEventListener("click", (e) => {
    e.preventDefault();
    window.brandStudio.open("https://vercel.com/account/tokens");
  });
}

async function boot() {
  const data = await window.brandStudio.load();
  state.config = data.config || {};
  state.drafts = data.drafts || [];
  state.sites = data.sites || [];
  $("token").value = "";
  $("token").placeholder = state.config.hasToken ? "저장됨 · 바꾸려면 새 토큰 입력" : "vercel_ 로 시작하는 토큰";
  $("teamId").value = state.config.teamId || "";
  $("repo").value = state.config.repo || "";
  $("opsHubUrl").value = state.config.opsHubUrl || "";
  $("opsMasterPassword").value = state.config.opsMasterPassword || "";
  $("deploymentProtectionBypass").value = "";
  $("deploymentProtectionBypass").placeholder = state.config.hasDeploymentBypass
    ? "저장됨 · 바꾸려면 새 시크릿 입력"
    : "Protected deployment 401 일 때 Vercel에서 생성";
  $("geminiModel").value = state.config.geminiModel || "";
  $("geminiApiKey").value = "";
  $("geminiApiKey").placeholder = state.config.hasGeminiKey
    ? "저장됨 · 바꾸려면 새 키 입력"
    : "AIza… (메인 내용 보충·사이트마다 다른 카피)";
  if (state.drafts[0]) fillForm(state.drafts[0]);
  else {
    $("siteTheme").value = "random";
    renderVendorGroups([emptyVendorGroup()]);
  }
  renderSites();
  if (!state.config.hasToken) {
    $("settings-status").textContent = "토큰이 없습니다. 계정 설정에서 Vercel 토큰을 저장하세요.";
  } else if (!state.config.hasGeminiKey) {
    $("settings-status").textContent = "제미나이 키가 없습니다. 계정 설정에 넣어야 사이트마다 메인 내용이 달라집니다.";
  }
}

boot().catch((err) => setStatus(err.message, true));
