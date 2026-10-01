import type { HubBoardTemplate, HubBoardTemplateBuildInput, HubBoardTemplateDraft } from "../types";
import type { HubTemplateDef, TopicCopy } from "../topic-copy";

function esc(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pick<T>(items: T[], variant: number, offset = 0): T {
  return items[Math.abs(variant + offset * 17) % items.length];
}

function hasBatchim(word: string) {
  const ch = String(word || "")
    .replace(/\s+/g, "")
    .slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function eulReul(word: string) {
  return hasBatchim(word) ? "을" : "를";
}

function excerptFromCopy(place: string, seo: string, copy: TopicCopy, keyword: string, variant: number) {
  const intro = String(copy.breedIntroParagraphs?.[0] || copy.breedSummaryShort || "")
    .replace(/\s+/g, " ")
    .trim();
  const lead = pick(
    [
      `${place} ${seo} 안내입니다.`,
      `${place}에서 ${seo} 전 확인할 핵심을 정리했습니다.`,
      `${keyword} 기준으로 본 ${seo} 체크포인트입니다.`,
    ],
    variant,
    6
  );
  if (!intro) return lead.slice(0, 160);
  const merged = `${lead} ${intro}`.replace(/\s+/g, " ").trim();
  return merged.length > 180 ? `${merged.slice(0, 177)}…` : merged;
}

function paras(texts: readonly string[]) {
  return texts.map((p) => `<p>${esc(p)}</p>`).join("\n");
}

function ol(items: readonly string[]) {
  return `<ol>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>`;
}

function ul(items: readonly string[]) {
  return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}

function guideCards(rows: readonly { item: string; guide: string }[], caption: string) {
  return `<section class="breed-guide" data-block="breed-guide">
<h3 class="breed-guide-title">${esc(caption)}</h3>
<div class="breed-guide-list">
${rows
  .map(
    (row) =>
      `<article class="breed-guide-card"><h4>${esc(row.item)}</h4><p>${esc(row.guide)}</p></article>`
  )
  .join("\n")}
</div>
</section>`;
}

function defaultStatLabels(kind: HubTemplateDef["kind"]) {
  if (kind === "breed-dog" || kind === "breed-cat" || kind === "dog-adoption" || kind === "cat-adoption") {
    return { size: "체구", coat: "털", origin: "원산·계통", homeNeed: "집 환경" };
  }
  if (kind === "dog-rehome" || kind === "cat-rehome" || kind === "dog-shelter") {
    return { size: "대상", coat: "상태 확인", origin: "진행 방식", homeNeed: "새 가정 조건" };
  }
  if (kind === "vet" || kind === "vet-marketing") {
    return { size: "진료 범위", coat: "응급·야간", origin: "선택 기준", homeNeed: "방문 전 준비" };
  }
  return { size: "핵심", coat: "확인 포인트", origin: "진행 방식", homeNeed: "적합 조건" };
}

function isPetKind(kind: HubTemplateDef["kind"]) {
  return (
    kind === "breed-dog" ||
    kind === "breed-cat" ||
    kind === "dog-adoption" ||
    kind === "cat-adoption" ||
    kind === "dog-rehome" ||
    kind === "cat-rehome" ||
    kind === "dog-shelter"
  );
}

export function buildRegionalSeoTemplate(def: HubTemplateDef, copy: TopicCopy): HubBoardTemplate {
  const topic = def.topicLabel;
  const seo = def.seoKeyword;
  const labels = { ...defaultStatLabels(def.kind), ...(copy.statLabels || {}) };

  function statsBlock() {
    const rows = [
      { label: labels.size || "항목1", value: copy.stats.size },
      { label: labels.coat || "항목2", value: copy.stats.coat },
      { label: labels.origin || "항목3", value: copy.stats.origin },
      { label: labels.homeNeed || "항목4", value: copy.stats.homeNeed },
    ];
    return `<div class="breed-stats" data-block="breed-stats">
${rows
  .map(
    (row) =>
      `<div class="breed-stat"><span class="breed-stat-label">${esc(row.label)}</span><span class="breed-stat-value">${esc(row.value)}</span></div>`
  )
  .join("\n")}
</div>`;
  }

  function titleFor(input: HubBoardTemplateBuildInput) {
    const place = input.place || "전국";
    return pick(
      [
        `${place} ${seo}, 기준을 먼저 세우고 천천히 진행합니다`,
        `${place} ${seo} 가이드 · 확인 포인트부터`,
        `${place}에서 ${seo} 고를 때 꼭 볼 체크포인트`,
        `${seo} ${place} · 안전한 진행 순서`,
        `${place} ${seo}, 신중히 비교하는 안내`,
        `${place} ${seo} 전 확인할 핵심 기준`,
      ],
      input.variant,
      1
    );
  }

  function leadFor(input: HubBoardTemplateBuildInput) {
    const place = esc(input.place || "이 지역");
    const keyword = esc(input.keyword);
    const topicParticle = eulReul(topic);
    const seoParticle = eulReul(seo);
    return pick(
      [
        `<p>${place}에서 ${esc(topic)}${topicParticle} 알아보기 전, 기준과 준비부터 함께 짚습니다. ${keyword} 검색 후에도 문의·진행이 이어질 수 있는지가 중요합니다.</p>`,
        `<p>${place} ${esc(input.topic)}${topicParticle} 고민 중이라면 겉모습·가격만 비교하기보다, 조건·기록·진행 방식을 먼저 확인하세요.</p>`,
        `<p>${keyword} — ${esc(topic)}의 핵심 포인트와 절차를 ${place} 생활권에 맞춰 정리한 안내입니다.</p>`,
      ],
      input.variant,
      2
    );
  }

  function introBlock(input: HubBoardTemplateBuildInput) {
    const place = esc(input.place || "전국");
    const heading = copy.introHeading || (isPetKind(def.kind) ? `${topic.replace(/분양$|파양$/, "")} 안내`.replace(/\s+/g, "") : `${topic} 안내`);
    const seoParticle = eulReul(seo);
    const local = pick(
      [
        `<p>${place}에서 ${esc(seo)}${seoParticle} 알아볼 때도 기본 특성을 먼저 이해하면 상담이 짧아집니다.</p>`,
        `<p>${place} 생활권 기준으로도 조건·동선·준비가 ${esc(topic)}과 맞는지 먼저 대입해 보세요.</p>`,
      ],
      input.variant,
      4
    );
    return `<h2>${esc(heading)}</h2>
<p>${esc(copy.breedSummaryShort)}</p>
${local}
${paras(copy.breedIntroParagraphs)}
${statsBlock()}`;
  }

  function steps(input: HubBoardTemplateBuildInput) {
    const place = esc(input.place || "지역");
    const seoParticle = eulReul(seo);
    const groups = copy.step4Groups
      .map(
        (g) =>
          `<h3>${esc(g.heading)}</h3>
${ul(g.items)}`
      )
      .join("\n");
    return `<h2>STEP 1 · ${place} ${esc(copy.step1Title)}</h2>
<p>${esc(copy.step1Lead)} ${place}에서 ${esc(seo)}${seoParticle} 볼 때도 아래 기준이 먼저입니다.</p>
${ol(copy.step1Checks)}
<h2>STEP 2 · ${place} ${esc(copy.step2Title)}</h2>
${paras(copy.step2Body)}
<p>${place} 여건과 동선에 맞춰 준비하면 첫 진행이 훨씬 수월합니다.</p>
<h2>STEP 3 · ${place} ${esc(copy.step3Title)}</h2>
${ol(copy.step3Steps)}
<h2>STEP 4 · ${esc(copy.step4Title)}</h2>
<p>${place}에서 ${esc(seo)} 확인 시에는 한 장면이 아니라 항목을 순서대로 봅니다.</p>
${groups}
<h2>STEP 5 · ${esc(copy.step5Title)}</h2>
${paras(copy.step5Body)}
<p>${place} ${esc(seo)} 이후에도 질문을 이어갈 수 있는 곳을 우선하세요.</p>`;
  }

  function careFlow(input: HubBoardTemplateBuildInput) {
    const place = esc(input.place || "지역");
    const vendor = String(input.vendor.vendorName || "").trim();
    const seoParticle = eulReul(seo);
    const items = copy.careFlow
      .map((row, i) => {
        let body = row.body;
        if (vendor && i === 0) {
          body = `${body} ${place}에서는 ${vendor} 상담을 통해 조건 매칭을 점검해 볼 수 있습니다.`;
        }
        return `<h3>${String(i + 1).padStart(2, "0")} · ${esc(row.title)}</h3><p>${esc(body)}</p>`;
      })
      .join("\n");
    return `<h2>${place} ${esc(seo)}${seoParticle} 이어서 돕는 흐름</h2>
<p>상담 → 확인 → 진행 → 사후 안내까지 한 흐름으로 이어지는 편이 안전합니다.</p>
${items}`;
  }

  function detailBlock(input: HubBoardTemplateBuildInput) {
    const parasAll = [...copy.breedDetailParagraphs];
    const start = Math.abs(input.variant) % Math.max(1, parasAll.length);
    const rotated = [...parasAll.slice(start), ...parasAll.slice(0, start)];
    const detailHeading = copy.detailHeading || `${topic} 상세 안내`;
    const healthCaption = copy.healthCaption || `${topic}에서 자주 보는 확인 항목`;
    const careCaption = copy.careCaption || `${topic} 일상·실무 관리`;
    return `<h2>${esc(detailHeading)}</h2>
${paras(rotated)}
${guideCards(copy.healthRows, healthCaption)}
${guideCards(copy.careRows, careCaption)}`;
  }

  function faqFor(input: HubBoardTemplateBuildInput) {
    const place = input.place || "지역";
    const vendor = String(input.vendor.vendorName || "").trim() || "추천 업체";
    const base = copy.faq.map((item) => ({
      question: item.question.replace(/전국/g, place).slice(0, 120),
      answer: item.answer.replace(/전국/g, place).slice(0, 450),
    }));
    const localExtra = [
      {
        question: `${place} ${seo}은(는) 어떻게 시작하나요?`,
        answer: `원하는 조건과 일정을 정리한 뒤 ${place} 기준으로 상담하고, 가능하면 현장·기록을 직접 확인하세요.`,
      },
      {
        question: `${vendor}에 무엇을 물어보면 되나요?`,
        answer: "비용 구성, 추가비 유무, 일정, 사후 문의 범위, 확인 가능한 자료 제공 여부를 먼저 확인하세요.",
      },
    ];
    const merged = [...base.slice(0, 4), ...localExtra].slice(0, 6);
    return pick([merged, [...localExtra, ...base].slice(0, 6)], input.variant, 5);
  }

  function closing(input: HubBoardTemplateBuildInput) {
    const place = esc(input.place || "지역");
    const vendor = String(input.vendor.vendorName || "").trim();
    const seoParticle = eulReul(seo);
    const cta = vendor
      ? `궁금한 점은 ${esc(vendor)}에 전화로 문의하는 것이 가장 확실합니다.`
      : `궁금한 점은 상담 가능한 곳에 전화로 문의하는 것이 가장 확실합니다.`;
    return `<h2>차분하게 시작하는 ${place} ${esc(seo)}</h2>
<p>${esc(copy.closing)}</p>
<p>${place}에서 ${esc(seo)}${seoParticle} 고민 중이라면 겉모습보다 조건·기록·진행을 먼저 보세요. ${cta}</p>`;
  }

  function build(input: HubBoardTemplateBuildInput): HubBoardTemplateDraft {
    const place = input.place || "전국";
    const blocks = [leadFor(input), introBlock(input), steps(input), careFlow(input), detailBlock(input), closing(input)].filter(
      Boolean
    );
    const head = blocks.slice(0, 2);
    const middle = blocks.slice(2, -1);
    const tail = blocks.slice(-1);
    const rot = Math.abs(input.variant) % Math.max(1, middle.length);
    const ordered = [...head, ...middle.slice(rot), ...middle.slice(0, rot), ...tail];

    return {
      title: titleFor(input),
      excerpt: excerptFromCopy(place, seo, copy, input.keyword, input.variant),
      bodyHtml: ordered.join("\n"),
      faqItems: faqFor(input),
      regionInfo: place,
      nearbyAreas: input.nearby.slice(0, 5),
      nearbyStations: input.stations.slice(0, 5),
      slugHint: `${place}-${seo}`,
    };
  }

  return {
    id: def.id,
    label: def.label,
    topicLabel: def.topicLabel,
    build,
  };
}
