import { DemolitionLandingPage } from "@/components/main-landing/DemolitionLandingPage";
import { MainLandingPage } from "@/components/main-landing/MainLandingPage";
import { DEFAULT_DEMOLITION_IMAGE_FOLDER } from "@/lib/main-landing/demolition-images";
import {
  buildMainLandingCopy,
  isMainDesignId,
  parseMainLandingConfig,
  resolveMainLandingImages,
  type MainDesignId,
} from "@/lib/main-landing";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const SAMPLES: Record<
  MainDesignId,
  { keyword: string; brand: string; phone: string; address: string; industry: string }
> = {
  "scalp-tattoo-v1": {
    keyword: "송탄두피문신",
    brand: "필릭스스칼프",
    phone: "010-1234-5678",
    address: "경기 평택시 송탄 필릭스스칼프",
    industry: "두피문신",
  },
  "demolition-v1": {
    keyword: "부천철거",
    brand: "주식회사 인포씨에스",
    phone: "0000-0000",
    address: "경기도 부천시 원미구 상동",
    industry: "철거",
  },
};

type Props = {
  params: Promise<{ designId: string }>;
  searchParams: Promise<{ keyword?: string }>;
};

export default async function DevSampleDesignPage({ params, searchParams }: Props) {
  const { designId: raw } = await params;
  const query = await searchParams;
  if (!isMainDesignId(raw)) notFound();
  const designId = raw;
  const base = SAMPLES[designId];
  const keywordOverride = String(query.keyword || "").trim();
  const sample = keywordOverride ? { ...base, keyword: keywordOverride } : base;
  const config = parseMainLandingConfig({
    enabled: true,
    designId,
    vendor: {
      name: sample.brand,
      keyword: sample.keyword,
      phone: sample.phone,
      address: sample.address,
      businessNumber: designId === "demolition-v1" ? "224-87-00683" : "",
      kakao: "",
      industry: sample.industry,
      region: "",
      intro: `${sample.keyword} 지역 맞춤 안내`,
      website: "",
      strengths: "",
    },
    imageFolderUrl: designId === "demolition-v1" ? DEFAULT_DEMOLITION_IMAGE_FOLDER : "",
    slots: {},
    prompt: "",
    seoTitleSuffix: designId === "demolition-v1" ? "폐업철거 전문 · 폐업지원금" : "SMP 정수리탈모",
    variationSeed: "",
  });
  const copy = buildMainLandingCopy(config, sample.keyword);
  const images = await resolveMainLandingImages(config, sample.keyword);

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: 12,
          right: 12,
          zIndex: 9999,
          background: "rgba(0,0,0,0.75)",
          color: "#fff",
          padding: "8px 12px",
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        DEV 샘플 · {designId} · <a href="/dev/samples" style={{ color: "#9cf" }}>목록</a>
      </div>
      {designId === "demolition-v1" ? (
        <DemolitionLandingPage copy={copy} images={images} vendor={config.vendor} />
      ) : (
        <MainLandingPage copy={copy} images={images} vendor={config.vendor} designId={designId} />
      )}
    </>
  );
}
