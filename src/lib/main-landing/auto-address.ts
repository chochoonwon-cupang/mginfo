/**
 * 주소 미입력 시 키워드 지역 → 시/구/동 자동 (키워드마다 동은 고정·임의 선택)
 */

export type RegionAddressHint = {
  province?: string;
  city: string;
  district?: string;
  dongs: string[];
};

type RawRegionRow = { keys: string[]; hint: Omit<RegionAddressHint, "dongs"> & { dong?: string; dongs?: string[] } };

/** 대표 지역 — 긴 키부터 검사 */
const REGION_ROWS: RawRegionRow[] = [
  { keys: ["청라"], hint: { province: "인천광역시", city: "서구", dongs: ["청라동", "가정동", "경서동"] } },
  { keys: ["송도"], hint: { province: "인천광역시", city: "연수구", dongs: ["송도동", "동춘동", "연수동"] } },
  { keys: ["부평"], hint: { province: "인천광역시", city: "부평구", dongs: ["부평동", "십정동", "산곡동"] } },
  { keys: ["계양"], hint: { province: "인천광역시", city: "계양구", dongs: ["계산동", "작전동", "효성동"] } },
  { keys: ["인천"], hint: { province: "인천광역시", city: "서구", dongs: ["청라동", "가좌동", "검암동"] } },
  { keys: ["부천"], hint: { province: "경기도", city: "부천시", district: "원미구", dongs: ["상동", "중동", "심곡동", "역곡동", "춘의동"] } },
  { keys: ["과천"], hint: { province: "경기도", city: "과천시", dongs: ["갈현동", "별양동", "중앙동"] } },
  { keys: ["평택", "송탄"], hint: { province: "경기도", city: "평택시", dongs: ["송탄동", "비전동", "세교동", "용이동"] } },
  { keys: ["안산"], hint: { province: "경기도", city: "안산시", district: "단원구", dongs: ["고잔동", "와동", "선부동"] } },
  { keys: ["수원"], hint: { province: "경기도", city: "수원시", district: "영통구", dongs: ["영통동", "매탄동", "광교동"] } },
  { keys: ["성남", "분당"], hint: { province: "경기도", city: "성남시", district: "분당구", dongs: ["정자동", "서현동", "수내동", "야탑동"] } },
  { keys: ["고양", "일산"], hint: { province: "경기도", city: "고양시", district: "일산서구", dongs: ["주엽동", "대화동", "탄현동"] } },
  { keys: ["김포"], hint: { province: "경기도", city: "김포시", dongs: ["장기동", "구래동", "운양동"] } },
  { keys: ["파주"], hint: { province: "경기도", city: "파주시", dongs: ["금촌동", "운정동", "교하동"] } },
  { keys: ["시흥"], hint: { province: "경기도", city: "시흥시", dongs: ["정왕동", "신현동", "은행동", "대야동"] } },
  { keys: ["화성", "동탄"], hint: { province: "경기도", city: "화성시", dongs: ["반송동", "보라동", "기배동", "동탄동"] } },
  { keys: ["용인"], hint: { province: "경기도", city: "용인시", district: "수지구", dongs: ["죽전동", "풍덕천동", "상현동"] } },
  { keys: ["안양"], hint: { province: "경기도", city: "안양시", district: "동안구", dongs: ["평촌동", "관양동", "호계동"] } },
  { keys: ["의정부"], hint: { province: "경기도", city: "의정부시", dongs: ["의정부동", "가능동", "민락동"] } },
  { keys: ["남양주"], hint: { province: "경기도", city: "남양주시", dongs: ["다산동", "별내동", "화도읍"] } },
  { keys: ["하남"], hint: { province: "경기도", city: "하남시", dongs: ["미사동", "풍산동", "신장동"] } },
  { keys: ["광명"], hint: { province: "경기도", city: "광명시", dongs: ["철산동", "하안동", "광명동"] } },
  { keys: ["군포"], hint: { province: "경기도", city: "군포시", dongs: ["산본동", "금정동", "당동"] } },
  { keys: ["오산"], hint: { province: "경기도", city: "오산시", dongs: ["원동", "궐동", "세마동"] } },
  { keys: ["경기"], hint: { province: "경기도", city: "수원시", district: "영통구", dongs: ["영통동", "망포동", "하동"] } },
  { keys: ["강남"], hint: { province: "서울특별시", city: "강남구", dongs: ["역삼동", "논현동", "대치동"] } },
  { keys: ["서초"], hint: { province: "서울특별시", city: "서초구", dongs: ["서초동", "방배동", "잠원동"] } },
  { keys: ["송파"], hint: { province: "서울특별시", city: "송파구", dongs: ["잠실동", "문정동", "가락동"] } },
  { keys: ["강서"], hint: { province: "서울특별시", city: "강서구", dongs: ["마곡동", "등촌동", "화곡동"] } },
  { keys: ["마포"], hint: { province: "서울특별시", city: "마포구", dongs: ["상암동", "공덕동", "연남동"] } },
  { keys: ["서울"], hint: { province: "서울특별시", city: "강남구", dongs: ["역삼동", "삼성동", "대치동"] } },
  { keys: ["대전"], hint: { province: "대전광역시", city: "서구", dongs: ["둔산동", "월평동", "탄방동"] } },
  { keys: ["대구"], hint: { province: "대구광역시", city: "수성구", dongs: ["범어동", "만촌동", "수성동"] } },
  { keys: ["부산"], hint: { province: "부산광역시", city: "해운대구", dongs: ["우동", "재송동", "좌동"] } },
  { keys: ["광주"], hint: { province: "광주광역시", city: "서구", dongs: ["치평동", "금호동", "농성동"] } },
  { keys: ["울산"], hint: { province: "울산광역시", city: "남구", dongs: ["삼산동", "달동", "무거동"] } },
  { keys: ["제주"], hint: { province: "제주특별자치도", city: "제주시", dongs: ["연동", "노형동", "이도동"] } },
];

function normalizeHint(raw: RawRegionRow["hint"]): RegionAddressHint {
  const dongs =
    raw.dongs && raw.dongs.length ? [...raw.dongs] : raw.dong ? [raw.dong] : ["중앙동"];
  return {
    province: raw.province,
    city: raw.city,
    district: raw.district,
    dongs,
  };
}

function hashSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function findRegionHint(keyword: string): RegionAddressHint | null {
  const text = String(keyword || "");
  for (const row of REGION_ROWS) {
    if (row.keys.some((key) => text.includes(key))) return normalizeHint(row.hint);
  }
  return null;
}

export function pickRegionDong(keyword: string, hint: RegionAddressHint): string {
  const list = hint.dongs.length ? hint.dongs : ["중앙동"];
  if (list.length === 1) return list[0];
  const seed = hashSeed(`${keyword}|${hint.city}|${hint.district || ""}`);
  return list[seed % list.length] || list[0];
}

/** "경기도 부천시 원미구 상동" */
export function autoStreetAddressFromKeyword(keyword: string): string {
  const hint = findRegionHint(keyword);
  if (!hint) return "";
  const dong = pickRegionDong(keyword, hint);
  const cityPart =
    hint.province && (hint.city.includes("시") || hint.city.includes("구"))
      ? hint.city
      : hint.city;
  return [hint.province, cityPart, hint.district, dong].filter(Boolean).join(" ");
}

export function extractRegionLabel(keyword: string): string {
  const stripped = String(keyword || "")
    .replace(
      /두피문신|스칼프문신|헤어라인문신|폐업|철거|상가철거|SMP|smp|시술|교육|센터|스튜디오/gi,
      ""
    )
    .replace(/\s+/g, "")
    .trim();
  return stripped || "지역";
}

/** 레거시: 업체명까지 붙인 한 줄 */
export function autoAddressFromKeyword(keyword: string, brandName: string): string {
  const brand = String(brandName || "").trim() || "스튜디오";
  const street = autoStreetAddressFromKeyword(keyword);
  if (street) return `${street} ${brand}`.trim();
  const region = extractRegionLabel(keyword);
  if (region && region !== "지역") return `${region} ${brand}`.trim();
  return brand;
}

export function resolveVendorAddress(input: {
  address?: string;
  keyword?: string;
  name?: string;
}): string {
  const typed = String(input.address || "").trim();
  if (typed) return typed;
  const street = autoStreetAddressFromKeyword(String(input.keyword || ""));
  if (street) return street;
  return autoAddressFromKeyword(String(input.keyword || ""), String(input.name || ""));
}

/** @deprecated use REGION_ROWS via findRegionHint */
export const REGION_ADDRESS_HINTS = REGION_ROWS.map((row) => ({
  keys: row.keys,
  hint: normalizeHint(row.hint),
}));
