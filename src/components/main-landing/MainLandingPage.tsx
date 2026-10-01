import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  MainLandingCopy,
  MainLandingResolvedImages,
  MainLandingSectionId,
  MainLandingVendor,
} from "@/lib/main-landing";

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function CtaPrimary({
  vendor,
  copy,
}: {
  vendor: MainLandingVendor;
  copy: MainLandingCopy;
}) {
  if (vendor.kakao) {
    return (
      <a className="ml-btn is-primary" href={vendor.kakao} target="_blank" rel="noopener noreferrer">
        {copy.ctaLabel}
      </a>
    );
  }
  if (vendor.phone) {
    return (
      <a className="ml-btn is-primary" href={telHref(vendor.phone)}>
        {copy.ctaPhone}
      </a>
    );
  }
  return null;
}

function Section({
  id,
  copy,
  images,
  vendor,
}: {
  id: MainLandingSectionId;
  copy: MainLandingCopy;
  images: MainLandingResolvedImages;
  vendor: MainLandingVendor;
}) {
  if (id === "hero") {
    return (
      <section className="ml-hero" id="top">
        <div className="ml-hero-bg" aria-hidden="true">
          {images.hero ? <img src={images.hero} alt="" /> : null}
          <div className="ml-hero-shade" />
        </div>
        <div className="ml-hero-inner">
          <p className="ml-kicker is-light">{copy.heroKicker}</p>
          <h1>
            {copy.heroTitle}
            <span className="ml-hero-sub">{copy.heroSubtitle}</span>
          </h1>
          <p className="ml-lead is-light">{copy.heroLead}</p>
          {copy.heroHint ? <p className="ml-hero-hint">{copy.heroHint}</p> : null}
          <div className="ml-cta-row">
            <a className="ml-btn is-ghost" href="#services">
              {copy.ctaSecondary}
            </a>
            <CtaPrimary vendor={vendor} copy={copy} />
          </div>
        </div>
      </section>
    );
  }

  if (id === "about") {
    return (
      <section className="ml-band" id="about">
        <div className="ml-wrap ml-about">
          <div>
            <p className="ml-kicker">{copy.aboutKicker}</p>
            <h2 className="ml-title">{copy.aboutTitle}</h2>
            <p className="ml-body">{copy.aboutBody}</p>
            <div className="ml-promises">
              {copy.aboutPromises.map((p) => (
                <article key={p.n} className="ml-promise">
                  <p className="ml-promise-n">{p.n}</p>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="ml-about-media">
            {images.about ? <img src={images.about} alt="" /> : <div className="ml-photo-empty" />}
            <span className="ml-about-badge">{copy.brand} · Studio</span>
          </div>
        </div>
      </section>
    );
  }

  if (id === "process") {
    return (
      <section className="ml-band is-deep" id="process">
        <div className="ml-wrap">
          <div className="ml-center">
            <p className="ml-kicker is-teal">{copy.processKicker}</p>
            <h2 className="ml-title is-light">{copy.processTitle}</h2>
            <p className="ml-body is-light-muted">{copy.processLead}</p>
          </div>
          <ol className="ml-steps">
            {copy.processSteps.map((step, i) => (
              <li key={`${step.title}-${i}`}>
                <span className="ml-step-n">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  if (id === "services") {
    return (
      <section className="ml-band is-soft" id="services">
        <div className="ml-wrap">
          <div className="ml-services-head">
            <div>
              <p className="ml-kicker">{copy.servicesKicker}</p>
              <h2 className="ml-title">{copy.servicesTitle}</h2>
              <p className="ml-body">{copy.servicesLead}</p>
            </div>
            <CtaPrimary vendor={vendor} copy={copy} />
          </div>
          <div className="ml-service-grid">
            {copy.services.map((item, i) => {
              const thumb = images.gallery[i % Math.max(images.gallery.length, 1)] || images.about || images.hero;
              return (
                <article key={item.title} className="ml-service-card">
                  <div className="ml-service-thumb">
                    {thumb ? <img src={thumb} alt="" loading="lazy" /> : null}
                    {item.tag ? <span className="ml-tag">{item.tag}</span> : null}
                  </div>
                  <div className="ml-service-body">
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  if (id === "gallery") {
    if (!images.gallery.length) return null;
    const featured = images.gallery.slice(0, 2);
    const rest = images.gallery.slice(2);
    return (
      <section className="ml-band" id="gallery">
        <div className="ml-wrap">
          <div className="ml-center">
            <p className="ml-kicker">{copy.galleryKicker}</p>
            <h2 className="ml-title">{copy.galleryTitle}</h2>
            <p className="ml-body">{copy.galleryLead}</p>
          </div>
          <div className="ml-gallery">
            {featured.map((url, index) => (
              <figure key={`feat-${index}`} className="is-feature">
                <img src={url} alt="" loading="lazy" />
              </figure>
            ))}
            {rest.map((url, index) => (
              <figure key={`grid-${index}`}>
                <img src={url} alt="" loading="lazy" />
              </figure>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (id === "director") {
    return (
      <section className="ml-band" id="director">
        <div className="ml-wrap">
          <div className="ml-center">
            <p className="ml-kicker">{copy.directorKicker}</p>
            <h2 className="ml-title">{copy.directorTitle}</h2>
            <p className="ml-body">{copy.directorLead}</p>
          </div>
          <div className="ml-director-grid">
            {copy.directorGroups.map((g) => (
              <div key={g.title} className="ml-director-card">
                <h3>{g.title}</h3>
                <ul>
                  {g.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (id === "reviews") {
    return (
      <section className="ml-band is-soft" id="reviews">
        <div className="ml-wrap">
          <div className="ml-center">
            <p className="ml-kicker">{copy.reviewsKicker}</p>
            <h2 className="ml-title">{copy.reviewsTitle}</h2>
            <p className="ml-body">{copy.reviewsLead}</p>
          </div>
          <div className="ml-reviews">
            {copy.reviews.map((r) => (
              <blockquote key={`${r.name}-${r.course}`}>
                <p className="ml-quote-mark">&ldquo;</p>
                <p className="ml-quote">{r.quote}</p>
                <footer>
                  <strong>{r.name}</strong>
                  <span>{r.course}</span>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ml-band" id="faq">
      <div className="ml-wrap ml-faq-wrap">
        <div className="ml-center">
          <p className="ml-kicker">{copy.faqKicker}</p>
          <h2 className="ml-title">{copy.faqTitle}</h2>
          <p className="ml-body">{copy.faqLead}</p>
        </div>
        <div className="ml-faq">
          {copy.faqs.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MainLandingPage({
  copy,
  images,
  vendor,
  designId = "scalp-tattoo-v1",
}: {
  copy: MainLandingCopy;
  images: MainLandingResolvedImages;
  vendor: MainLandingVendor;
  designId?: string;
}) {
  const theme = copy.theme;
  const year = new Date().getFullYear();
  const isDemolition = designId === "demolition-v1";
  return (
    <div
      className={`main-landing${isDemolition ? " is-demolition" : ""}`}
      style={
        {
          ["--ml-accent" as string]: theme.accent,
          ["--ml-teal" as string]: theme.teal,
          ["--ml-teal-deep" as string]: theme.tealDeep,
          ["--ml-soft" as string]: theme.soft,
          ["--ml-bg" as string]: theme.bg,
        } as CSSProperties
      }
    >
      <header className="ml-top">
        <div className="ml-top-bar" aria-hidden="true" />
        <div className="ml-top-row">
          <a className="ml-brand" href="#top">
            <span className="ml-brand-mark" aria-hidden="true" />
            <span className="ml-brand-text">
              <span className="ml-brand-en">{copy.brandEn}</span>
              <span className="ml-brand-ko">{copy.heroTitle}</span>
            </span>
          </a>
          <nav className="ml-nav" aria-label="메인 메뉴">
            {isDemolition ? (
              <>
                <a href="#about">소개</a>
                <a href="#gallery">시공사례</a>
                <a href="#process">진행절차</a>
                <a href="#reviews">후기</a>
                <a href="#faq">FAQ</a>
              </>
            ) : (
              <>
                <a href="#about">소개</a>
                <a href="#services">시술</a>
                <a href="#gallery">갤러리</a>
                <a href="#process">과정</a>
                <a href="#director">원장</a>
                <a href="#reviews">후기</a>
                <a href="#faq">FAQ</a>
              </>
            )}
            <Link className="ml-nav-blog" href="/posts">
              블로그
            </Link>
          </nav>
          {vendor.kakao ? (
            <a className="ml-btn is-kakao ml-top-cta" href={vendor.kakao} target="_blank" rel="noopener noreferrer">
              {copy.ctaLabel}
            </a>
          ) : vendor.phone ? (
            <a className="ml-btn is-kakao ml-top-cta" href={telHref(vendor.phone)}>
              {copy.ctaPhone}
            </a>
          ) : null}
        </div>
      </header>

      <main>
        {copy.sectionOrder.map((id) => (
          <Section key={id} id={id} copy={copy} images={images} vendor={vendor} />
        ))}
      </main>

      <footer className="ml-footer">
        <div className="ml-wrap ml-footer-grid">
          <div>
            <p className="ml-brand-en is-footer">{copy.brandEn}</p>
            <p className="ml-footer-name">
              {copy.heroTitle} {copy.brand}
            </p>
            <p className="ml-footer-tag">{copy.footerTagline}</p>
          </div>
          <div className="ml-footer-meta">
            {vendor.kakao ? (
              <a className="ml-footer-row" href={vendor.kakao} target="_blank" rel="noopener noreferrer">
                <span className="ml-ico" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 3C6.5 3 2 6.6 2 11c0 2.6 1.5 4.9 3.9 6.4-.1.6-.6 2.3-.7 2.7 0 .2.1.3.3.2.4-.2 2.5-1.6 2.9-1.9 1.1.3 2.3.5 3.6.5 5.5 0 10-3.6 10-8S17.5 3 12 3z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                {copy.ctaLabel}
              </a>
            ) : null}
            {vendor.phone ? (
              <a className="ml-footer-row" href={telHref(vendor.phone)}>
                <span className="ml-ico" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.2 1.1L6.6 10.8z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                {vendor.phone}
              </a>
            ) : null}
            {copy.displayAddress ? (
              <p className="ml-footer-row">
                <span className="ml-ico" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <span>{copy.displayAddress}</span>
              </p>
            ) : null}
            {vendor.businessNumber ? (
              <p className="ml-biz">사업자등록번호 {vendor.businessNumber}</p>
            ) : null}
            <p className="ml-copy">
              © {year} {copy.heroTitle} {copy.brand}
            </p>
          </div>
        </div>
      </footer>

      {(vendor.kakao || vendor.phone) && (
        <div className="ml-fixed-cta">
          {vendor.kakao ? (
            <a href={vendor.kakao} target="_blank" rel="noopener noreferrer" className="ml-btn is-kakao">
              {copy.ctaLabel}
            </a>
          ) : null}
          {vendor.phone ? (
            <a href={telHref(vendor.phone)} className="ml-btn is-primary">
              {vendor.phone}
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
