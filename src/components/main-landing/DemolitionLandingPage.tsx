import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  DemolitionBlockId,
  MainLandingCopy,
  MainLandingResolvedImages,
  MainLandingVendor,
} from "@/lib/main-landing";

const DEFAULT_BLOCK_ORDER: DemolitionBlockId[] = [
  "reviews",
  "about",
  "process",
  "gallery",
  "grant",
  "trust",
  "cta",
  "faq",
];

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function demoThemeStyle(copy: MainLandingCopy): CSSProperties {
  const t = copy.theme;
  return {
    ["--demo-orange" as string]: t.teal,
    ["--demo-orange-deep" as string]: t.tealDeep,
    ["--demo-bg" as string]: t.bg,
    ["--demo-soft" as string]: t.soft,
    ["--demo-accent" as string]: t.accent,
  };
}

export function DemolitionLandingPage({
  copy,
  images,
  vendor,
}: {
  copy: MainLandingCopy;
  images: MainLandingResolvedImages;
  vendor: MainLandingVendor;
}) {
  const year = new Date().getFullYear();
  const grant = copy.grant;
  const stats = copy.stats || [];
  const cases = copy.galleryCases || [];
  const gallery = images.gallery.length ? images.gallery : images.hero ? [images.hero] : [];
  const legalName = vendor.name || copy.brand;
  const blockOrder = copy.demolitionBlockOrder?.length ? copy.demolitionBlockOrder : DEFAULT_BLOCK_ORDER;
  const layoutVariant = copy.demolitionLayoutVariant ?? 0;
  const faqs = copy.faqs?.length ? copy.faqs : [];

  const blocks: Record<DemolitionBlockId, ReactNode> = {
    reviews: (
      <section className="demo-section" id="reviews" key="reviews">
        <div className="demo-wrap">
          <h2 className="demo-h2">실제 이용 고객 만족도 95%</h2>
          <p className="demo-lead">{copy.reviewsLead}</p>
          <div className="demo-reviews">
            {copy.reviews.map((r) => (
              <article key={`${r.name}-${r.course}`} className="demo-review-card">
                <p className="demo-stars" aria-hidden="true">
                  ★★★★★
                </p>
                <p className="demo-quote">&ldquo;{r.quote}&rdquo;</p>
                <p className="demo-review-meta">
                  {r.name} | {r.course}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    ),
    about: (
      <section className="demo-section demo-section-alt" id="about" key="about">
        <div className="demo-wrap">
          <h2 className="demo-h2 demo-h2-split">{copy.aboutTitle}</h2>
          <div className="demo-pill-grid">
            {copy.aboutPromises.map((p) => (
              <article key={p.n} className="demo-pill">
                <span className="demo-pill-n">{p.n}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    ),
    process: (
      <section className="demo-section demo-section-dark" id="process" key="process">
        <div className="demo-wrap">
          <h2 className="demo-h2 is-light">{copy.processTitle}</h2>
          <p className="demo-lead is-light-muted">{copy.processLead}</p>
          <ol className="demo-process">
            {copy.processSteps.map((step, i) => (
              <li key={step.title}>
                <span className="demo-process-n">{String(i + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    ),
    gallery: (
      <section className="demo-section" id="gallery" key="gallery">
        <div className="demo-wrap">
          <h2 className="demo-h2">{copy.galleryTitle}</h2>
          <p className="demo-lead">{copy.galleryLead}</p>
          <div className="demo-case-grid">
            {cases.map((item, i) => {
              const img = gallery[i % gallery.length];
              return (
                <article key={item.title} className="demo-case">
                  <div className="demo-case-img">
                    {img ? <img src={img} alt="" loading="lazy" /> : null}
                    {item.tag ? <span className="demo-case-tag">{item.tag}</span> : null}
                  </div>
                  <h3>{item.title}</h3>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    ),
    services: (
      <section className="demo-section demo-section-alt" id="services" key="services">
        <div className="demo-wrap">
          <p className="demo-faq-kicker">{copy.servicesKicker}</p>
          <h2 className="demo-h2 demo-h2-split">{copy.servicesTitle}</h2>
          <p className="demo-lead">{copy.servicesLead}</p>
          <div className="demo-service-grid">
            {copy.services.map((s) => (
              <article key={s.title} className="demo-service-card">
                {s.tag ? <span className="demo-case-tag is-inline">{s.tag}</span> : null}
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    ),
    grant: grant ? (
      <section className="demo-grant" id="grant" key="grant">
        <div className="demo-wrap demo-grant-inner">
          <div className="demo-grant-lines">
            <p className="demo-grant-primary">{grant.primary}</p>
            <p className="demo-grant-secondary">{grant.secondary}</p>
            <h2 className="demo-grant-headline">{grant.headline}</h2>
          </div>
          <p className="demo-grant-body">{grant.body}</p>
          <p className="demo-grant-note">{grant.disclaimer}</p>
          <div className="demo-grant-actions">
            {vendor.phone ? (
              <a className="demo-btn is-primary" href={telHref(vendor.phone)}>
                지원금·견적 상담
              </a>
            ) : null}
            <a className="demo-btn is-grant-faq" href="#faq">
              자주 묻는 질문
            </a>
          </div>
        </div>
      </section>
    ) : null,
    trust: (
      <section className="demo-section demo-trust" key="trust">
        <div className="demo-wrap">
          {copy.trustTitle ? <h2 className="demo-h3">{copy.trustTitle}</h2> : null}
          {copy.trustBody ? <p className="demo-trust-body">{copy.trustBody}</p> : null}
          {stats.length ? (
            <div className="demo-stats">
              {stats.map((s) => (
                <div key={s.label} className="demo-stat">
                  <p className="demo-stat-value">{s.value}</p>
                  <p className="demo-stat-label">{s.label}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    ),
    cta: (
      <section className="demo-section demo-cta-band" key="cta">
        <div className="demo-wrap demo-cta-band-inner">
          <h2 className="demo-h2 is-light">
            철거 견적 · 지원금 상담
            <br />
            지금 바로 문의하세요
          </h2>
          {grant ? (
            <p className="demo-cta-sub is-light">
              {grant.primary} {grant.secondary}
            </p>
          ) : null}
          <div className="demo-hero-actions">
            {vendor.phone ? (
              <a className="demo-btn is-primary is-lg" href={telHref(vendor.phone)}>
                전화 상담 {vendor.phone}
              </a>
            ) : null}
            <a className="demo-btn is-ghost is-lg" href="#faq">
              자주 묻는 질문
            </a>
          </div>
        </div>
      </section>
    ),
    faq: (
      <section className="demo-section demo-faq-section" id="faq" key="faq">
        <div className="demo-wrap demo-faq-box">
          <p className="demo-faq-kicker">{copy.faqKicker}</p>
          <h2 className="demo-h2">{copy.faqTitle}</h2>
          <p className="demo-lead">{copy.faqLead}</p>
          <div className="demo-faq">
            {faqs.map((item, i) => (
              <details key={item.q} className="demo-faq-item" open={i === 0}>
                <summary>{item.q}</summary>
                <div className="demo-faq-answer">
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    ),
  };

  const orderedBlocks = blockOrder.map((id) => blocks[id]).filter(Boolean);

  return (
    <div
      className={`demo-landing is-dv-${layoutVariant}`}
      style={demoThemeStyle(copy)}
    >
      <header className="demo-top">
        <div className="demo-top-inner">
          <a className="demo-logo" href="#top">
            <strong>{copy.heroTitle}</strong>
            <span>{copy.heroSubtitle}</span>
          </a>
          <nav className="demo-nav" aria-label="메인">
            <a href="#about">소개</a>
            <a href="#gallery">시공사례</a>
            <a href="#process">진행절차</a>
            <a href="#faq">자주 묻는 질문</a>
            <Link href="/posts">블로그</Link>
          </nav>
          <div className="demo-top-cta">
            {vendor.phone ? (
              <a className="demo-btn is-primary" href={telHref(vendor.phone)}>
                전화 상담 {vendor.phone}
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <section className="demo-hero" id="top">
        {images.hero ? (
          <div className="demo-hero-bg" aria-hidden="true">
            <img src={images.hero} alt="" />
            <div className="demo-hero-shade" />
          </div>
        ) : null}
        <div className="demo-wrap demo-hero-inner">
          <p className="demo-badge">{copy.heroKicker}</p>
          <p className="demo-hero-label">{vendor.keyword || copy.heroTitle} 폐업철거 전문</p>
          <h1>
            {copy.heroTitle} <span className="demo-hero-sub">전문 · {copy.heroTitle}</span>
          </h1>
          <p className="demo-hero-lead">{copy.heroLead}</p>
          <div className="demo-hero-actions">
            {vendor.phone ? (
              <a className="demo-btn is-primary is-lg" href={telHref(vendor.phone)}>
                무료 상담 전화하기
              </a>
            ) : null}
            <a className="demo-btn is-ghost is-lg" href="#faq">
              자주 묻는 질문
            </a>
          </div>
        </div>
      </section>

      {orderedBlocks}

      <footer className="demo-footer">
        <div className="demo-wrap demo-footer-grid">
          <div>
            <h3>{copy.heroTitle}</h3>
            <p>{legalName}</p>
            <p>{grant?.headline || copy.tagline}</p>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              {vendor.phone ? <li>📞 {vendor.phone}</li> : null}
              {copy.displayAddress ? <li>📍 {copy.displayAddress}</li> : null}
            </ul>
          </div>
          <div>
            <h4>사업자 정보</h4>
            <ul>
              {legalName ? <li>회사명: {legalName}</li> : null}
              {vendor.businessNumber ? <li>사업자등록번호: {vendor.businessNumber}</li> : null}
            </ul>
          </div>
        </div>
        <p className="demo-copy">
          © {year} {legalName}. All rights reserved.
        </p>
      </footer>

      {vendor.phone ? (
        <div className="demo-sticky-bar">
          <a href={telHref(vendor.phone)}>무료 상담 · {vendor.phone}</a>
          <a href="#faq" className="is-accent">
            자주 묻는 질문
          </a>
        </div>
      ) : null}
    </div>
  );
}
