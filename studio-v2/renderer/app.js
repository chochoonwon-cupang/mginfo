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

function siteApex(site) {
  let apex = String(site?.apexDomain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (apex) return apex;
  const host = String(site?.domain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  const kr2 = ["co.kr", "or.kr", "go.kr", "ne.kr", "re.kr", "ac.kr"];
  const last2 = parts.slice(-2).join(".");
  if (kr2.includes(last2) && parts.length >= 3) return parts.slice(-3).join(".");
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return host;
}

function sitesSortedByApex() {
  return [...state.sites].sort((a, b) => {
    const ax = siteApex(a);
    const bx = siteApex(b);
    if (ax !== bx) return ax.localeCompare(bx, "ko");
    return String(a.keyword || a.domain || "").localeCompare(String(b.keyword || b.domain || ""), "ko");
  });
}

function renderSites() {
  const list = $("site-list");
  const pager = $("site-pager");
  const countEl = $("site-count");
  list.innerHTML = "";
  pager.innerHTML = "";

  const ordered = sitesSortedByApex();
  const total = ordered.length;
  if (!total) {
    if (countEl) countEl.textContent = "";
    list.innerHTML = "<li>아직 발행된 사이트가 없습니다.</li>";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(total / SITE_PAGE_SIZE));
  if (state.sitePage > totalPages) state.sitePage = totalPages;
  if (state.sitePage < 1) state.sitePage = 1;

  const start = (state.sitePage - 1) * SITE_PAGE_SIZE;
  const pageRows = ordered.slice(start, start + SITE_PAGE_SIZE);
  if (countEl) {
    countEl.textContent = `전체 ${total}개 · ${state.sitePage}/${totalPages}페이지 (페이지당 ${SITE_PAGE_SIZE}개) · apex별 묶음`;
  }

  let lastApex = "";
  for (const site of pageRows) {
    const apex = siteApex(site);
    if (apex && apex !== lastApex) {
      lastApex = apex;
      const apexCount = ordered.filter((s) => siteApex(s) === apex).length;
      const head = document.createElement("li");
      head.className = "apex-group-head";
      const info = document.createElement("div");
      info.innerHTML = `<strong>${apex}</strong><span class="hint">발행 대장 ${apexCount}개 키워드 · 이 apex hostProfiles만 일괄 수정</span>`;
      head.appendChild(info);
      const bulkBtn = document.createElement("button");
      bulkBtn.className = "btn";
      bulkBtn.type = "button";
      bulkBtn.textContent = "연락처 일괄반영";
      bulkBtn.onclick = () => openSiteEdit(site, { focusBulk: true });
      head.appendChild(bulkBtn);
      list.appendChild(head);
    }
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
    const delBtn = document.createElement("button");
    delBtn.className = "btn";
    delBtn.type = "button";
    delBtn.textContent = "삭제";
    delBtn.onclick = async () => {
      const dom = site.domain || site.id || "";
      if (
        !confirm(
          `${site.keyword || site.siteName} (${dom})\n\n· 발행 대장에서 제거\n· 서버 host 프로필 삭제 (메인 설정 초기화)\n\nVercel 도메인 연결은 유지됩니다. 같은 키워드로 다시 발행하면 됩니다.\n\n진행할까요?`
        )
      ) {
        return;
      }
      try {
        const res = await window.brandStudio.deleteSite({ domain: dom, removeRemoteProfile: true });
        state.sites = res.sites || [];
        if (state.editingDomain === dom) {
          $("site-edit").hidden = true;
          state.editingDomain = "";
        }
        renderSites();
        setStatus(
          res.remoteRemoved
            ? "대장·서버 프로필을 삭제했습니다. 같은 키워드로 재발행하세요."
            : "대장에서 삭제했습니다. (서버 프로필 삭제는 실패 — 재발행으로 덮어쓸 수 있음)"
        );
      } catch (err) {
        setStatus(err.message, true);
      }
    };
    actions.appendChild(delBtn);
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

function openSiteEdit(site, opts = {}) {
  state.editingDomain = site.domain || site.id || "";
  state.editingSite = site;
  const apex = siteApex(site);
  const apexCount = state.sites.filter((s) => siteApex(s) === apex).length;
  $("site-edit").hidden = false;
  $("site-edit-title").textContent = `${site.keyword || site.siteName} · ${site.domain}`;
  $("edit-naver-meta").value = site.naverSiteVerification || "";
  $("edit-naver-id").value = site.naverId || "";
  $("edit-naver-pw").value = site.naverPassword || "";
  $("edit-address").value = site.address || "";
  $("edit-site-theme").value = site.siteTheme || "folio";
  if ($("apex-bulk-hint")) {
    $("apex-bulk-hint").textContent = `메인 도메인 ${apex} · 발행 대장 ${apexCount}개 (서버에 프로필 있는 키워드만 갱신)`;
  }
  $("site-edit-status").textContent = "";
  $("site-edit").scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (opts.focusBulk && $("bulk-phone")) {
    $("bulk-phone").focus();
  }
}

function closeSiteEdit() {
  state.editingDomain = "";
  state.editingSite = null;
  $("site-edit").hidden = true;
  $("site-edit-status").textContent = "";
}

$("btn-cancel-site").onclick = () => closeSiteEdit();

const btnApplyApexContact = $("btn-apply-apex-contact");
if (btnApplyApexContact) {
  btnApplyApexContact.onclick = async () => {
    if (!state.editingSite || !state.editingDomain) {
      $("site-edit-status").textContent = "먼저 발행 대장에서 사이트를 선택하세요.";
      $("site-edit-status").style.color = "#f0a0a0";
      return;
    }
    const apex = siteApex(state.editingSite);
    const company = $("bulk-company").value.trim();
    const phone = $("bulk-phone").value.trim();
    const address = $("bulk-address").value.trim();
    const bizNo = $("bulk-bizno").value.trim();
    if (!company && !phone && !address && !bizNo) {
      $("site-edit-status").textContent = "상호·전화·주소·사업자번호 중 하나 이상 입력하세요.";
      $("site-edit-status").style.color = "#f0a0a0";
      return;
    }
    const n = state.sites.filter((s) => siteApex(s) === apex).length;
    if (
      !confirm(
        `${apex} 소속 키워드 host-profile에 연락처를 일괄 반영합니다.\n\n· 발행 대장 ${n}개 (같은 apex)\n· 다른 apex 사이트는 변경하지 않음\n· Vercel 재배포 없음\n\n진행할까요?`
      )
    ) {
      return;
    }
    $("site-edit-status").textContent = "일괄 반영 중…";
    $("site-edit-status").style.color = "";
    try {
      const res = await window.brandStudio.applyApexContact({
        domain: state.editingDomain,
        apex,
        company,
        phone,
        address,
        bizNo,
      });
      $("site-edit-status").textContent = `${res.apex}: 서버 ${res.hostsUpdated}개 host-profile 반영 (대장 ${res.ledgerCount}개 apex)`;
      $("site-edit-status").style.color = "";
      setStatus($("site-edit-status").textContent);
    } catch (err) {
      $("site-edit-status").textContent = err.message;
      $("site-edit-status").style.color = "#f0a0a0";
    }
  };
}

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

document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn[data-view]").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("show"));
    btn.classList.add("active");
    $(`view-${btn.dataset.view}`).classList.add("show");
  });
});

function publicSiteUrl(site) {
  const u = String(site?.siteUrl || "").trim();
  if (u) return u.replace(/\/$/, "");
  const d = String(site?.domain || "").trim();
  return d ? `https://${d}` : "";
}

function closeMetaModal() {
  const modal = $("meta-modal");
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
}

function renderMetaModalRows() {
  const wrap = $("meta-rows");
  const countEl = $("meta-modal-count");
  const filter = $("meta-filter-apex");
  if (!wrap) return;
  wrap.innerHTML = "";
  const apexFilter = filter ? String(filter.value || "").trim() : "";
  const rows = sitesSortedByApex().filter((s) => !apexFilter || siteApex(s) === apexFilter);
  if (countEl) {
    countEl.textContent = `${rows.length}개 사이트 · 입력한 항목만 서버 반영`;
  }
  if (!rows.length) {
    wrap.innerHTML = "<p class=\"hint\">발행 대장에 사이트가 없거나 필터에 맞는 항목이 없습니다.</p>";
    return;
  }
  for (const site of rows) {
    const domain = site.domain || site.id || "";
    const url = publicSiteUrl(site);
    const row = document.createElement("div");
    row.className = "meta-row";
    row.dataset.domain = domain;

    const head = document.createElement("div");
    head.className = "meta-row-head";
    head.innerHTML = `<strong>${site.keyword || site.siteName || domain}</strong><small>${domain}</small>`;
    const actions = document.createElement("div");
    actions.className = "meta-row-actions";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn sm";
    copyBtn.textContent = "링크 복사";
    copyBtn.onclick = async () => {
      if (!url) return;
      await window.brandStudio.copyText(url);
      copyBtn.textContent = "복사됨";
      setTimeout(() => {
        copyBtn.textContent = "링크 복사";
      }, 1200);
    };
    actions.appendChild(copyBtn);
    if (site.adminUrl) {
      const copyAdmin = document.createElement("button");
      copyAdmin.type = "button";
      copyAdmin.className = "btn sm";
      copyAdmin.textContent = "관리자 URL";
      copyAdmin.onclick = async () => {
        await window.brandStudio.copyText(site.adminUrl);
        copyAdmin.textContent = "복사됨";
        setTimeout(() => {
          copyAdmin.textContent = "관리자 URL";
        }, 1200);
      };
      actions.appendChild(copyAdmin);
    }
    head.appendChild(actions);

    const field = document.createElement("div");
    const ta = document.createElement("textarea");
    ta.rows = 2;
    ta.placeholder = "naver-site-verification content 또는 meta 태그";
    ta.value = site.naverSiteVerification || "";
    ta.dataset.domain = domain;
    field.appendChild(ta);

    row.appendChild(head);
    row.appendChild(field);
    wrap.appendChild(row);
  }
}

function openMetaModal() {
  const modal = $("meta-modal");
  if (!modal) return;
  const filter = $("meta-filter-apex");
  if (filter) {
    const apexes = [...new Set(state.sites.map((s) => siteApex(s)).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "ko")
    );
    const prev = filter.value;
    filter.innerHTML = "<option value=\"\">전체</option>";
    for (const apex of apexes) {
      const opt = document.createElement("option");
      opt.value = apex;
      opt.textContent = apex;
      filter.appendChild(opt);
    }
    filter.value = prev && apexes.includes(prev) ? prev : "";
  }
  if ($("meta-modal-status")) $("meta-modal-status").textContent = "";
  renderMetaModalRows();
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
}

function collectMetaModalEntries() {
  const entries = [];
  document.querySelectorAll("#meta-rows textarea[data-domain]").forEach((ta) => {
    const domain = ta.dataset.domain || "";
    const naverSiteVerification = ta.value.trim();
    if (!domain || !naverSiteVerification) return;
    entries.push({ domain, naverSiteVerification });
  });
  return entries;
}

const btnOpenMeta = $("btn-open-meta-modal");
if (btnOpenMeta) btnOpenMeta.onclick = () => openMetaModal();
const metaClose = $("meta-modal-close");
const metaClose2 = $("meta-modal-close2");
const metaBackdrop = $("meta-modal-backdrop");
if (metaClose) metaClose.onclick = () => closeMetaModal();
if (metaClose2) metaClose2.onclick = () => closeMetaModal();
if (metaBackdrop) metaBackdrop.onclick = () => closeMetaModal();
const metaFilter = $("meta-filter-apex");
if (metaFilter) metaFilter.onchange = () => renderMetaModalRows();
const metaApply = $("meta-modal-apply");
if (metaApply) {
  metaApply.onclick = async () => {
    const entries = collectMetaModalEntries();
    const status = $("meta-modal-status");
    if (!entries.length) {
      if (status) {
        status.textContent = "메타를 입력한 사이트가 없습니다.";
        status.style.color = "#f0a0a0";
      }
      return;
    }
    if (
      !confirm(
        `${entries.length}개 키워드의 네이버 메타를 서버(Blob)에 한 번에 반영합니다.\n\n· Vercel 재배포 없음\n· host-profile 없는 키워드는 건너뜀\n\n진행할까요?`
      )
    ) {
      return;
    }
    metaApply.disabled = true;
    if (status) {
      status.textContent = "반영 중…";
      status.style.color = "";
    }
    try {
      const res = await window.brandStudio.applyBulkNaverMeta({ entries });
      state.sites = res.sites || state.sites;
      renderSites();
      const nf = (res.notFound || []).length;
      const msg = `완료: ${res.updated || 0}개 적용 · 건너뜀 ${res.skipped || 0}${nf ? ` · 프로필 없음 ${nf}` : ""}`;
      if (status) {
        status.textContent = msg;
        status.style.color = "";
      }
      setStatus(msg);
    } catch (err) {
      if (status) {
        status.textContent = err.message;
        status.style.color = "#f0a0a0";
      }
    } finally {
      metaApply.disabled = false;
    }
  };
}

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
