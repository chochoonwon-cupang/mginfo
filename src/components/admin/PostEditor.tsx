"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ARTICLE_STYLE_GROUPS,
  ARTICLE_STYLE_OPTIONS,
  randomStyleHint,
  type ArticleStyleChoice,
} from "@/lib/article-style";
import { DEFAULT_GEMINI_NOTES, resolveGeminiNotes } from "@/lib/gemini-notes";
import { extraImageLimit, MAX_POST_IMAGES } from "@/lib/post-images";
import { pickImageFiles, prepareUploadImage } from "@/lib/prepare-upload-image";
import { extractPlaceName } from "@/lib/region-geo";
import { MultiFileButton } from "@/components/admin/MultiFileButton";
import { VendorPicker } from "@/components/admin/VendorPicker";
import { MAX_LISTING_VENDORS } from "@/lib/vendor-ads";
import { ensureVendorSlots } from "@/lib/vendor-slots";
import type { Category, CategorySlug, FaqItem, Post, PostImage, PostStatus, PublishMode } from "@/lib/types";

const EMPTY_FAQ: FaqItem = { question: "", answer: "" };

function padFaqs(items?: FaqItem[]): FaqItem[] {
  const next = (items || []).slice(0, 5);
  while (next.length < 4) next.push({ ...EMPTY_FAQ });
  return next;
}

export function PostEditor({
  post,
  variant = "admin",
  defaultPublishMode,
}: {
  post?: Post;
  variant?: "admin" | "public";
  defaultPublishMode?: PublishMode;
}) {
  const router = useRouter();
  const publishMode: PublishMode = defaultPublishMode || post?.publishMode || "ai";
  const isPublic = variant === "public";
  const [title, setTitle] = useState(post?.title || "");
  const [slug, setSlug] = useState(post?.slug || "");
  const [excerpt, setExcerpt] = useState(post?.excerpt || "");
  const [bodyHtml, setBodyHtml] = useState(post?.bodyHtml || "");
  const [category, setCategory] = useState<CategorySlug>(post?.category || "life");
  const [tags, setTags] = useState(post?.tags.join(", ") || "");
  const [coverImage, setCoverImage] = useState(post?.coverImage || "");
  const [coverCaption, setCoverCaption] = useState(post?.coverCaption || "");
  const [extraImages, setExtraImages] = useState<PostImage[]>(post?.extraImages || []);
  const [focusKeyword, setFocusKeyword] = useState(post?.focusKeyword || "");
  const [faqItems, setFaqItems] = useState<FaqItem[]>(padFaqs(post?.faqItems));
  const [status, setStatus] = useState<PostStatus>(post?.status || "draft");
  const [theme, setTheme] = useState(post?.theme || "art-blog");
  const [region, setRegion] = useState(post?.region || "");
  const [regionInfo, setRegionInfo] = useState(post?.regionInfo || "");
  const [nearbyAreas, setNearbyAreas] = useState((post?.nearbyAreas || []).join(", "));
  const [nearbyStations, setNearbyStations] = useState((post?.nearbyStations || []).join(", "));
  const [vendorName, setVendorName] = useState(post?.vendorName || "");
  const [vendorPhone, setVendorPhone] = useState(post?.vendorPhone || "");
  const [vendorWebsite, setVendorWebsite] = useState(post?.vendorWebsite || "");
  const [vendorKakao, setVendorKakao] = useState(post?.vendorKakao || "");
  const [vendorPlaceUrl, setVendorPlaceUrl] = useState(post?.vendorPlaceUrl || "");
  const [vendorId, setVendorId] = useState(post?.vendorId || "");
  const [vendorIds, setVendorIds] = useState<string[]>(
    post?.vendorIds?.length ? post.vendorIds : post?.vendorId ? [post.vendorId] : []
  );
  const [youtubeUrl1, setYoutubeUrl1] = useState(post?.youtubeUrl1 || "");
  const [youtubeUrl2, setYoutubeUrl2] = useState(post?.youtubeUrl2 || "");
  const [vendorBizNo, setVendorBizNo] = useState(post?.vendorBizNo || "");
  const [vendorAddress, setVendorAddress] = useState(post?.vendorAddress || "");
  const [writingStyle, setWritingStyle] = useState<ArticleStyleChoice>("info");
  const [keywords, setKeywords] = useState("");
  const [notes, setNotes] = useState(DEFAULT_GEMINI_NOTES);
  const [extraPrompt, setExtraPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendorOpen, setVendorOpen] = useState(
    Boolean(
      post?.vendorName ||
        post?.vendorPhone ||
        post?.vendorWebsite ||
        post?.vendorKakao ||
        post?.vendorPlaceUrl ||
        post?.vendorId
    )
  );
  const [faqOpen, setFaqOpen] = useState(Boolean(post?.faqItems?.some((item) => item.question && item.answer)));
  const [vendorCatalog, setVendorCatalog] = useState<{ id: string; name: string }[]>([]);
  const [gateNote, setGateNote] = useState("");
  const [imageFolderUrl, setImageFolderUrl] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [vendorLabels, setVendorLabels] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};
    if (post?.vendorId && post?.vendorName) start[post.vendorId] = post.vendorName;
    return start;
  });
  const notesForCategory = useRef("");

  useEffect(() => {
    fetch("/api/ad-vendors")
      .then((res) => res.json())
      .then((data) => {
        setVendorCatalog(
          Array.isArray(data.vendors)
            ? data.vendors.map((row: { id: string; name: string }) => ({
                id: row.id,
                name: row.name,
              }))
            : []
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        const list: Category[] = data.categories || [];
        setCategories(list);
        setCategory((current) => {
          if (post) return current;
          if (list.length && !list.some((c) => c.slug === current)) return list[0].slug;
          return current;
        });
      })
      .catch(() => undefined);
  }, [post]);

  useEffect(() => {
    if (!categories.length) return;
    if (notesForCategory.current === category) return;
    notesForCategory.current = category;
    const cat = categories.find((c) => c.slug === category);
    setNotes(resolveGeminiNotes("", cat?.geminiNotes));
  }, [category, categories]);

  useEffect(() => {
    if (region.trim()) return;
    const found = extractPlaceName(focusKeyword, title, keywords);
    if (found) setRegion(found);
  }, [focusKeyword, title, keywords, region]);

  async function runGenerate() {
    setError("");
    setMessage("");
    setGateNote("");
    if (!focusKeyword.trim()) {
      setError("제미나이로 쓰려면 메인 키워드를 입력하세요.");
      return;
    }
    setGenBusy(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writingStyle,
          category,
          keywords,
          notes,
          focusKeyword,
          region: region.trim() || extractPlaceName(focusKeyword, title, keywords),
          vendorName,
          vendorId: vendorId || vendorIds[0] || "",
          vendorPhone,
          vendorWebsite,
          vendorKakao,
          experienceNotes: extraPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.publishGate || data.generationLog) {
          setGateNote(
            [
              data.publishGate || "HOLD",
              data.generationMode,
              data.industryId,
              data.error,
            ]
              .filter(Boolean)
              .join(" · ")
          );
        }
        throw new Error(data.error || "생성 실패");
      }
      setTitle(data.article.title);
      setExcerpt(data.article.excerpt || "");
      setBodyHtml(ensureVendorSlots(data.article.bodyHtml || ""));
      setTags((data.article.tags || []).join(", "));
      if (data.article.faqItems) setFaqItems(padFaqs(data.article.faqItems));
      if (data.article.regionInfo) setRegionInfo(data.article.regionInfo);
      if (data.article.nearbyAreas) setNearbyAreas(data.article.nearbyAreas.join(", "));
      if (data.article.nearbyStations) setNearbyStations(data.article.nearbyStations.join(", "));
      if (!slug && data.article.slugHint) setSlug(data.article.slugHint);
      if (!region.trim() && data.region) setRegion(data.region);
      if (!region.trim()) {
        const found = extractPlaceName(data.article.title, focusKeyword, keywords);
        if (found) setRegion(found);
      }
      const styleNote = data.writingStyleLabel ? ` ${data.writingStyleLabel}으로 작성했습니다.` : "";
      const gate = data.publishGate || data.article?.generationLog?.publishDecision || "";
      setGateNote(
        [
          gate,
          data.generationMode || data.article?.generationMode,
          data.industryId || data.article?.industryId,
          data.contentAngle || data.article?.contentAngle,
        ]
          .filter(Boolean)
          .join(" · ")
      );
      setMessage(`제미나이 초안을 넣었습니다.${styleNote} 확인하고 발행하세요.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setGenBusy(false);
    }
  }

  async function uploadImage(file: File) {
    const prepared = await prepareUploadImage(file);
    const form = new FormData();
    form.append("file", prepared);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "업로드 실패");
    return String(data.url || "");
  }

  async function uploadExtra(index: number, file: File) {
    setError("");
    setMessage("");
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setExtraImages((rows) => rows.map((row, i) => (i === index ? { ...row, url } : row)));
      setMessage("사진을 올렸습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function uploadMany(files: File[]) {
    const images = pickImageFiles(files);
    if (!images.length) {
      setError("선택한 파일에서 사진을 찾지 못했습니다. 앨범에서 사진을 다시 골라 주세요.");
      return;
    }
    setError("");
    setMessage("");
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of images) urls.push(await uploadImage(file));
      const extraCap = extraImageLimit(true);
      let nextCover = coverImage;
      let nextExtras = extraImages.filter((row) => row.url.trim());
      let skipped = 0;
      for (const url of urls) {
        if (!nextCover) {
          nextCover = url;
          continue;
        }
        if (nextExtras.length >= extraCap) {
          skipped += 1;
          continue;
        }
        nextExtras = [...nextExtras, { url, caption: "" }];
      }
      setCoverImage(nextCover);
      setExtraImages(nextExtras);
      const kept = urls.length - skipped;
      setMessage(
        skipped
          ? `${kept}장을 올렸습니다. 대표 포함 최대 ${MAX_POST_IMAGES}장이라 ${skipped}장은 건너뛰었습니다.`
          : `${urls.length}장을 올렸습니다.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function importFolderImages() {
    const folder = imageFolderUrl.trim();
    if (!folder) {
      setError("웹 폴더 주소를 넣으세요. 예: https://image.cattery.co.kr/dalma/");
      return;
    }
    setFolderBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/bulk/folder-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: folder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "폴더를 읽지 못했습니다.");
      const urls = Array.isArray(data.urls)
        ? data.urls.map((item: unknown) => String(item || "")).filter(Boolean)
        : [];
      if (!urls.length) {
        setError("폴더에서 이미지를 찾지 못했습니다. 주소와 목록 공개 여부를 확인하세요.");
        return;
      }
      const extraCap = extraImageLimit(true);
      const nextCover = urls[0];
      const nextExtras = urls.slice(1, 1 + extraCap).map((url: string) => ({ url, caption: "" }));
      setCoverImage(nextCover);
      setExtraImages(nextExtras);
      setMessage(`폴더에서 ${1 + nextExtras.length}장을 가져왔습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "폴더를 읽지 못했습니다.");
    } finally {
      setFolderBusy(false);
    }
  }

  async function save() {
    setError("");
    setMessage("");
    const resolvedTitle = title.trim() || focusKeyword.trim();
    if (!resolvedTitle) {
      setError("제목을 쓰거나, 메인 키워드를 넣고 초안을 만드세요.");
      return;
    }
    if (!category) {
      setError("카테고리를 선택하세요.");
      return;
    }
    if (!bodyHtml.trim() && status === "published") {
      setError("본문을 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: resolvedTitle,
        slug,
        excerpt,
        bodyHtml: ensureVendorSlots(bodyHtml),
        category,
        tags,
        coverImage,
        coverCaption,
        extraImages: extraImages.filter((item) => item.url.trim()),
        focusKeyword,
        faqItems: faqItems.filter((item) => item.question.trim() && item.answer.trim()),
        status,
        theme,
        publishMode,
        region: region.trim() || extractPlaceName(resolvedTitle, focusKeyword, keywords),
        regionInfo,
        nearbyAreas,
        nearbyStations,
        vendorName,
        vendorPhone,
        vendorWebsite,
        vendorKakao,
        vendorPlaceUrl,
        vendorId,
        vendorIds,
        youtubeUrl1,
        youtubeUrl2,
        vendorBizNo,
        vendorAddress,
      };
      const res = await fetch(post ? `/api/posts/${post.id}` : "/api/posts", {
        method: post ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장 실패");
      const indexed =
        status === "published"
          ? data.indexNow?.ok
            ? " 네이버 색인 요청을 보냈습니다."
            : " 네이버 색인 요청은 나중에 다시 시도됩니다."
          : "";
      setMessage((status === "published" ? "발행했습니다." : "초안으로 저장했습니다.") + indexed);
      if (isPublic && status === "published" && data.post?.slug) {
        router.push(`/posts/${data.post.slug}`);
      } else if (isPublic) {
        router.push("/admin/posts");
      } else {
        router.push("/admin/posts");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  if (isPublic) {
    return (
      <div className="blog-ai-editor">
        <div className="blog-ai-hero">
          <h2>AI로 글 만들기</h2>
          <p>메인 키워드를 넣고 초안 생성을 누르면 글이 만들어집니다. 아래 설정을 먼저 고르면 초안에 반영됩니다.</p>
          <label className="blog-ai-kw-label" htmlFor="ai-focus-keyword">
            메인 키워드
          </label>
          <input
            id="ai-focus-keyword"
            className="blog-ai-kw"
            value={focusKeyword}
            onChange={(e) => setFocusKeyword(e.target.value)}
            placeholder="예: 부천강아지분양"
            disabled={genBusy}
          />
        </div>

        <details className="blog-ai-more blog-ai-pre">
          <summary>
            <span className="blog-ai-summary-title">초안 생성 전 설정</span>
            <span className="blog-ai-summary-hint">
              글 방향·보조 키워드·추가 프롬프트·업체·이미지 웹 폴더를 선택해 두면, 초안 생성 시 해당 내용이 반영됩니다.
            </span>
          </summary>
          <div className="blog-ai-more-body">
            <label>글 방향 / 작성 형식</label>
            <div className="article-style-groups">
              <div className="article-style-group">
                <div className="article-style-row">
                  <button
                    type="button"
                    className={writingStyle === "random" ? "on" : ""}
                    onClick={() => setWritingStyle("random")}
                  >
                    랜덤
                  </button>
                </div>
              </div>
              {ARTICLE_STYLE_GROUPS.map((group) => (
                <div key={group.id} className="article-style-group">
                  <strong>{group.label}</strong>
                  <div className="article-style-row">
                    {ARTICLE_STYLE_OPTIONS.filter((item) => item.group === group.id).map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        className={writingStyle === item.value ? "on" : ""}
                        onClick={() => setWritingStyle(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="field-hint" style={{ marginTop: 0 }}>
              {writingStyle === "random"
                ? randomStyleHint(focusKeyword, keywords, title)
                : ARTICLE_STYLE_OPTIONS.find((item) => item.value === writingStyle)?.hint}
            </p>

            <label>보조 키워드 (선택)</label>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="예: 분양, 접종, 상담"
            />

            <label>추가 프롬프트 (선택)</label>
            <textarea
              value={extraPrompt}
              onChange={(e) => setExtraPrompt(e.target.value)}
              placeholder="실제 방문·상담 메모가 있으면 적어 주세요."
              style={{ minHeight: 100 }}
            />

            <label>소개 업체 (선택)</label>
            <div className="blog-ai-vendor-row">
              <VendorPicker
                label={vendorIds.length ? "업체 추가" : "업체 선택"}
                onPick={(fields) => {
                  if (vendorIds.includes(fields.vendorId)) return;
                  if (vendorIds.length >= MAX_LISTING_VENDORS) {
                    setError(`안내 업체는 ${MAX_LISTING_VENDORS}곳까지입니다.`);
                    return;
                  }
                  const label = String(fields.vendorName || "").trim() || fields.vendorId;
                  const next = [...vendorIds, fields.vendorId];
                  setVendorIds(next);
                  setVendorId(next[0]);
                  setVendorLabels((prev) => ({ ...prev, [fields.vendorId]: label }));
                  if (!vendorIds.length) {
                    setVendorName(label);
                    setVendorPhone(fields.vendorPhone);
                    setVendorWebsite(fields.vendorWebsite);
                    setVendorKakao(fields.vendorKakao);
                    setVendorBizNo(fields.vendorBizNo);
                    setVendorAddress(fields.vendorAddress);
                    setYoutubeUrl1(fields.youtubeUrl1);
                    setYoutubeUrl2(fields.youtubeUrl2);
                  }
                }}
              />
              <p className="field-hint" style={{ margin: 0 }}>
                광고업체정보설정에 등록된 업체를 고르면 초안·글에 반영됩니다.
              </p>
            </div>
            {vendorIds.length ? (
              <ul className="vendor-pick-chips blog-ai-vendor-chips">
                {vendorIds.map((id, index) => {
                  const row = vendorCatalog.find((item) => item.id === id);
                  const label = vendorLabels[id] || row?.name || (index === 0 ? vendorName : "") || id;
                  return (
                    <li key={id}>
                      <b>{index + 1}</b>
                      <span className="blog-ai-vendor-name">{label}</span>
                      <button
                        className="blog-ai-remove"
                        type="button"
                        onClick={() => {
                          const next = vendorIds.filter((item) => item !== id);
                          setVendorIds(next);
                          setVendorId(next[0] || "");
                          setVendorLabels((prev) => {
                            const copy = { ...prev };
                            delete copy[id];
                            return copy;
                          });
                          if (!next.length) {
                            setVendorName("");
                            setVendorPhone("");
                            setVendorWebsite("");
                            setVendorKakao("");
                            setVendorBizNo("");
                            setVendorAddress("");
                          } else if (index === 0) {
                            const first = next[0];
                            setVendorName(vendorLabels[first] || vendorCatalog.find((v) => v.id === first)?.name || "");
                          }
                        }}
                      >
                        빼기
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <label>이미지 웹 폴더 (선택)</label>
            <div className="blog-ai-folder-row">
              <input
                value={imageFolderUrl}
                onChange={(e) => setImageFolderUrl(e.target.value)}
                placeholder="https://image.cattery.co.kr/dalma/"
                disabled={folderBusy}
              />
              <button
                type="button"
                className="blog-ai-folder-btn"
                disabled={folderBusy}
                onClick={() => void importFolderImages()}
              >
                {folderBusy ? "가져오는 중…" : "폴더에서 가져오기"}
              </button>
            </div>
            <p className="field-hint" style={{ marginTop: 0 }}>
              사이트 이미지 폴더 주소를 넣으면 그 안의 사진을 가져와 대표·본문 이미지로 씁니다.
            </p>
            {coverImage ? (
              <div className="blog-ai-cover-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cover-preview" src={coverImage} alt="대표 이미지" />
                <button
                  type="button"
                  className="blog-ai-remove"
                  onClick={() => {
                    setCoverImage("");
                    setExtraImages([]);
                  }}
                >
                  이미지 비우기
                </button>
              </div>
            ) : null}
            {extraImages.length > 0 ? (
              <div className="blog-ai-thumbs">
                {extraImages.map((image, index) =>
                  image.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${image.url}-${index}`} src={image.url} alt={`추가 ${index + 1}`} />
                  ) : null
                )}
              </div>
            ) : null}
          </div>
        </details>

        <div className="blog-ai-generate-row">
          <button
            className="blog-compose-publish blog-ai-generate"
            type="button"
            onClick={() => runGenerate()}
            disabled={genBusy}
          >
            {genBusy ? "작성 중…" : "초안 생성"}
          </button>
          {gateNote ? <p className="blog-compose-msg">{gateNote}</p> : null}
          {error ? <p className="blog-compose-msg is-error">{error}</p> : null}
          {message ? <p className="blog-compose-msg is-ok">{message}</p> : null}
        </div>

        <details className="blog-ai-more" open={Boolean(bodyHtml || title)}>
          <summary>
            <span className="blog-ai-summary-title">초안 결과</span>
            <span className="blog-ai-summary-hint">생성 후 제목·본문을 확인하고 발행하세요.</span>
          </summary>
          <div className="blog-ai-more-body">
            <label>제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="초안 생성 후 자동으로 채워집니다"
            />
            <label>본문</label>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="초안 생성 후 여기에 본문이 들어옵니다. 필요하면 수정하세요."
            />
            <label>상태</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as PostStatus)}>
              <option value="draft">초안</option>
              <option value="published">발행</option>
            </select>
            <div className="admin-actions">
              <button className="btn btn-primary" type="button" onClick={save} disabled={busy || !bodyHtml.trim()}>
                {busy ? "저장 중…" : status === "published" ? "발행하기" : "초안 저장"}
              </button>
            </div>
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="editor-grid">
      <div className="admin-card admin-form">
        <h2>{post ? "글 수정" : "새 글 작성"}</h2>
        <p className="field-hint" style={{ marginTop: 0 }}>
          <span className="req">*</span> 표시는 필수입니다.
        </p>
        <label>제목</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="원하는 제목이 있을 때만 작성하세요. 메인 키워드로 초안을 만들면 제목이 자동으로 만들어집니다."
        />
        <label>
          카테고리 <span className="req">*</span>
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value as CategorySlug)}>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
          {category && !categories.some((c) => c.slug === category) ? (
            <option value={category}>{category}</option>
          ) : null}
        </select>
        <label>
          메인 키워드 (SEO) <span className="req">*</span>
        </label>
        <input
          value={focusKeyword}
          onChange={(e) => setFocusKeyword(e.target.value)}
          placeholder="예: 부천강아지분양"
        />
        <div className="editor-fold-row">
          <button className="editor-fold" type="button" onClick={() => setVendorOpen((open) => !open)}>
            <span>소개 업체 작성</span>
            <small>{vendorOpen ? "접기" : "펼침"}</small>
          </button>
          <VendorPicker
            label={vendorIds.length ? "업체 추가" : "업체선택"}
            onPick={(fields) => {
              setVendorOpen(true);
              if (vendorIds.includes(fields.vendorId)) return;
              if (vendorIds.length >= MAX_LISTING_VENDORS) {
                setError(`안내 업체는 ${MAX_LISTING_VENDORS}곳까지입니다.`);
                return;
              }
              const next = [...vendorIds, fields.vendorId];
              setVendorIds(next);
              setVendorId(next[0]);
              if (!vendorIds.length) {
                setVendorName(fields.vendorName);
                setVendorPhone(fields.vendorPhone);
                setVendorWebsite(fields.vendorWebsite);
                setVendorKakao(fields.vendorKakao);
                setVendorBizNo(fields.vendorBizNo);
                setVendorAddress(fields.vendorAddress);
              }
            }}
          />
        </div>
        {vendorOpen ? (
          <div className="vendor-admin">
            <h3>소개 업체</h3>
            <p className="field-hint" style={{ marginTop: 0 }}>
              안내 업체는 {MAX_LISTING_VENDORS}곳까지 넣을 수 있습니다. 여기에 넣으면 이 글에는 카테고리 업체가 나가지
              않고, 넣은 업체만 중간·하단 배너로 보입니다. 제휴업체모집중 칸은 카테고리 설정이나 자유게시판 광고에서 켠
              경우에 맨 아래에 하나 더 붙습니다.
            </p>
            {vendorIds.length ? (
              <ul className="vendor-pick-chips">
                {vendorIds.map((id, index) => {
                  const row = vendorCatalog.find((item) => item.id === id);
                  return (
                    <li key={id}>
                      <b>{index + 1}</b>
                      {row?.name || id}
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => {
                          const next = vendorIds.filter((item) => item !== id);
                          setVendorIds(next);
                          setVendorId(next[0] || "");
                        }}
                      >
                        빼기
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <label>업체명</label>
            <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="예: 인포씨에스" />
            <label>전화번호</label>
            <input value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} placeholder="예: 032-000-0000" />
            <label>홈페이지 주소</label>
            <input
              value={vendorWebsite}
              onChange={(e) => setVendorWebsite(e.target.value)}
              placeholder="https://..."
            />
            <label>카카오톡 주소</label>
            <input
              value={vendorKakao}
              onChange={(e) => setVendorKakao(e.target.value)}
              placeholder="https://pf.kakao.com/..."
            />
            <label>네이버 플레이스 주소</label>
            <input
              value={vendorPlaceUrl}
              onChange={(e) => setVendorPlaceUrl(e.target.value)}
              placeholder="https://naver.me/... 또는 플레이스 주소"
            />
            <p className="field-hint">
              넣으면 글 하단에 사용한 사진, 짧은 소개, 네이버 플레이스 바로가기 버튼이 붙습니다.
            </p>
          </div>
        ) : null}
        <label>게시글 유튜브 1 (우선)</label>
        <input
          value={youtubeUrl1}
          onChange={(e) => setYoutubeUrl1(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
        <label>게시글 유튜브 2 (우선)</label>
        <input
          value={youtubeUrl2}
          onChange={(e) => setYoutubeUrl2(e.target.value)}
          placeholder="두 번째 영상이 있으면 넣습니다"
        />
        <p className="field-hint">
          글을 열면 여기 넣은 영상이 업체 영상보다 먼저 나갑니다. 비워 두면 연결된 업체 영상을 씁니다.
        </p>
        <button className="editor-fold" type="button" onClick={() => setFaqOpen((open) => !open)}>
          <span>자주 묻는 질문</span>
          <small>{faqOpen ? "접기" : "펼침"}</small>
        </button>
        {faqOpen ? (
          <div className="vendor-admin">
            <p className="field-hint" style={{ marginTop: 0 }}>
              비워 두면 키워드·지역으로 자동 질문이 붙습니다. 직접 쓸 때만 열어서 수정하세요.
            </p>
            {faqItems.map((item, index) => (
              <div className="faq-admin-row" key={`faq-${index}`}>
                <input
                  value={item.question}
                  onChange={(e) =>
                    setFaqItems((rows) =>
                      rows.map((row, i) => (i === index ? { ...row, question: e.target.value } : row))
                    )
                  }
                  placeholder={`질문 ${index + 1}`}
                />
                <textarea
                  style={{ minHeight: 72 }}
                  value={item.answer}
                  onChange={(e) =>
                    setFaqItems((rows) => rows.map((row, i) => (i === index ? { ...row, answer: e.target.value } : row)))
                  }
                  placeholder="답변"
                />
              </div>
            ))}
          </div>
        ) : null}
        <label>
          본문 HTML <span className="req">*</span>
        </label>
        <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />
        <label>태그 (쉼표로 구분)</label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
        <label>대표 이미지</label>
        <div className="cover-upload">
          <MultiFileButton
            label={uploading ? "올리는 중…" : "사진 여러 장 선택"}
            busy={uploading}
            onFiles={(files) => void uploadMany(files)}
          />
          {coverImage ? (
            <button className="btn btn-ghost" type="button" onClick={() => setCoverImage("")}>
              이미지 빼기
            </button>
          ) : null}
        </div>
        <input
          value={coverImage}
          onChange={(e) => setCoverImage(e.target.value)}
          placeholder="또는 이미지 주소 https://..."
        />
        <input
          value={coverCaption}
          onChange={(e) => setCoverCaption(e.target.value)}
          placeholder="사진 아래 짧은 설명 (예: 오래된 구획은 실측부터 합니다)"
        />
        <p className="field-hint">
          휴대폰·컴퓨터에서 사진을 여러 장 한 번에 고를 수 있습니다. 첫 장이 대표, 나머지는 추가 사진입니다. 대표 포함
          최대 {MAX_POST_IMAGES}장입니다.
        </p>
        {coverImage ? (
          <img className="cover-preview" src={coverImage} alt="대표 이미지 미리보기" />
        ) : null}
        <div className="extra-images">
          <h3 className="admin-subhead">추가 사진</h3>
          <p className="field-hint" style={{ marginTop: 0 }}>
            대표 포함 최대 7장입니다. 위 버튼으로 여러 장을 한 번에 올리거나, 아래에서 장마다 바꿀 수 있습니다. 추가
            사진은 소제목 앞에 들어가고, 남는 장은 하단 갤러리에 모입니다.
          </p>
          <div className="cover-upload">
            <MultiFileButton
              label={uploading ? "올리는 중…" : "추가 사진 여러 장 선택"}
              busy={uploading}
              onFiles={(files) => void uploadMany(files)}
            />
          </div>
          {extraImages.map((image, index) => (
            <div className="extra-image-row" key={`extra-${index}`}>
              <label>추가 사진 {index + 2}</label>
              <div className="cover-upload">
                <MultiFileButton
                  label={uploading ? "올리는 중…" : "올리기"}
                  busy={uploading}
                  multiple={false}
                  onFiles={(files) => {
                    const file = files[0];
                    if (file) void uploadExtra(index, file);
                  }}
                />
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setExtraImages((rows) => rows.filter((_, i) => i !== index))}
                >
                  빼기
                </button>
              </div>
              <input
                value={image.url}
                onChange={(e) =>
                  setExtraImages((rows) =>
                    rows.map((row, i) => (i === index ? { ...row, url: e.target.value } : row))
                  )
                }
                placeholder="이미지 주소 https://..."
              />
              <input
                value={image.caption || ""}
                onChange={(e) =>
                  setExtraImages((rows) =>
                    rows.map((row, i) => (i === index ? { ...row, caption: e.target.value } : row))
                  )
                }
                placeholder="사진 아래 짧은 설명"
              />
              {image.url ? <img className="cover-preview" src={image.url} alt={`추가 사진 ${index + 2}`} /> : null}
            </div>
          ))}
          {extraImages.length < extraImageLimit(true) ? (
            <div className="cover-upload">
              <MultiFileButton
                label={uploading ? "올리는 중…" : `사진 추가 (${extraImages.length + 1}/7)`}
                busy={uploading}
                onFiles={(files) => void uploadMany(files)}
              />
            </div>
          ) : null}
        </div>
        <label>본문 테마</label>
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="art-blog">블로그형</option>
          <option value="art-v1">뉴스형</option>
          <option value="art-v2">매거진형</option>
          <option value="art-v3">리포트형</option>
          <option value="art-v4">칼럼형</option>
          <option value="art-v5">특집형</option>
        </select>
        <label>상태</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as PostStatus)}>
          <option value="draft">초안</option>
          <option value="published">발행</option>
        </select>
        {error && <p className="notice">{error}</p>}
        {message && <p className="notice ok">{message}</p>}
        <div className="admin-actions">
          <button className="btn btn-primary" type="button" onClick={save} disabled={busy}>
            {busy ? "저장 중…" : status === "published" ? "발행하기" : "초안 저장"}
          </button>
        </div>
      </div>
      <div className="admin-card admin-form">
        <h2>제미나이로 작성</h2>
        <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 0 }}>
          메인 키워드와 지역 재료로 매번 새 글을 씁니다. 글방향은 시선만 정하고, 목차는 키워드에 맞게 새로 짭니다.
          반려·맛집·미용·여행 글은 해당 지역 공공 저장본 숫자가 하단에 붙습니다.
        </p>
        <label>
          글 방향 <span className="req">*</span>
        </label>
        <div className="article-style-groups">
          <div className="article-style-group">
            <div className="article-style-row">
              <button
                type="button"
                className={writingStyle === "random" ? "on" : ""}
                onClick={() => setWritingStyle("random")}
              >
                랜덤
              </button>
            </div>
          </div>
          {ARTICLE_STYLE_GROUPS.map((group) => (
            <div key={group.id} className="article-style-group">
              <strong>{group.label}</strong>
              <div className="article-style-row">
                {ARTICLE_STYLE_OPTIONS.filter((item) => item.group === group.id).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={writingStyle === item.value ? "on" : ""}
                    onClick={() => setWritingStyle(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="field-hint">
          {writingStyle === "random"
            ? randomStyleHint(focusKeyword, keywords, title)
            : ARTICLE_STYLE_OPTIONS.find((item) => item.value === writingStyle)?.hint}
        </p>
        <label>보조 키워드</label>
        <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="예: 등기부, 확정일자, 보증금" />
        <label>추가 프롬프트 (실제 방문 후기)</label>
        <textarea
          value={extraPrompt}
          onChange={(e) => setExtraPrompt(e.target.value)}
          placeholder={
            "예: 부천 중동 OO식당. 토요일 저녁 대기 20분. 된장찌개는 간 세고 고기는 질기지 않았음. 주차는 건물 뒤가 편했음. 다음에 찌개만 다시 먹을 듯."
          }
          style={{ minHeight: 120 }}
        />
        <p className="field-hint">
          식당·매장에 직접 가서 본 것과 생각을 대략 적으면, 그 내용으로 후기글을 완성합니다. 비워 두면 가짜 방문
          후기는 만들지 않습니다. 사진은 위쪽에서 따로 넣으면 됩니다. 맛집이면 글방향을 맛집리뷰형이나 방문후기형으로
          고르면 더 맞습니다.
        </p>
        <div className="admin-actions">
          <button className="btn btn-primary" type="button" onClick={() => runGenerate()} disabled={genBusy}>
            {genBusy ? "작성 중…" : "초안 생성"}
          </button>
        </div>
        {gateNote ? (
          <p className="field-hint" style={{ marginTop: 8 }}>
            생성 결과: {gateNote}
          </p>
        ) : null}
        <p style={{ color: "#64748b", fontSize: 12 }}>
          API 키는 <a href="/admin/settings">설정</a>에서 저장합니다. PASS/WARN은 초안을 넣고, HOLD는 자동으로 넣지
          않습니다.
        </p>
      </div>
    </div>
  );
}
