/** 키워드 → 시·구·동 자동 (src/lib/main-landing/auto-address.ts 와 동일 규칙) */

const REGION_ROWS = [
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
  { keys: ["경기"], hint: { province: "경기도", city: "수원시", district: "영통구", dongs: ["영통동", "망포동", "하동"] } },
  { keys: ["강남"], hint: { province: "서울특별시", city: "강남구", dongs: ["역삼동", "논현동", "대치동"] } },
  { keys: ["서울"], hint: { province: "서울특별시", city: "강남구", dongs: ["역삼동", "삼성동", "대치동"] } },
  { keys: ["부산"], hint: { province: "부산광역시", city: "해운대구", dongs: ["우동", "재송동", "좌동"] } },
  { keys: ["대구"], hint: { province: "대구광역시", city: "수성구", dongs: ["범어동", "만촌동", "수성동"] } },
  { keys: ["대전"], hint: { province: "대전광역시", city: "서구", dongs: ["둔산동", "월평동", "탄방동"] } },
  { keys: ["광주"], hint: { province: "광주광역시", city: "서구", dongs: ["치평동", "금호동", "농성동"] } },
  { keys: ["제주"], hint: { province: "제주특별자치도", city: "제주시", dongs: ["연동", "노형동", "이도동"] } },
];

function normalizeHint(raw) {
  const dongs = raw.dongs && raw.dongs.length ? raw.dongs : raw.dong ? [raw.dong] : ["중앙동"];
  return { province: raw.province, city: raw.city, district: raw.district, dongs };
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function findRegionHint(keyword) {
  const text = String(keyword || "");
  for (const row of REGION_ROWS) {
    if (row.keys.some((key) => text.includes(key))) return normalizeHint(row.hint);
  }
  return null;
}

function pickRegionDong(keyword, hint) {
  const list = hint.dongs.length ? hint.dongs : ["중앙동"];
  if (list.length === 1) return list[0];
  const seed = hashSeed(`${keyword}|${hint.city}|${hint.district || ""}`);
  return list[seed % list.length] || list[0];
}

function autoStreetAddressFromKeyword(keyword) {
  const hint = findRegionHint(keyword);
  if (!hint) return "";
  const dong = pickRegionDong(keyword, hint);
  return [hint.province, hint.city, hint.district, dong].filter(Boolean).join(" ");
}

function autoAddressFromKeyword(keyword, brandName) {
  const brand = String(brandName || "").trim() || "스튜디오";
  const street = autoStreetAddressFromKeyword(keyword);
  if (street) return `${street} ${brand}`.trim();
  const region = String(keyword || "")
    .replace(/두피문신|스칼프문신|폐업|철거|SMP|smp|시술|교육|센터|스튜디오/gi, "")
    .replace(/\s+/g, "")
    .trim();
  if (region) return `${region} ${brand}`.trim();
  return brand;
}

function resolveVendorAddress({ address, keyword, name }) {
  const typed = String(address || "").trim();
  if (typed) return typed;
  const street = autoStreetAddressFromKeyword(keyword);
  if (street) return street;
  return autoAddressFromKeyword(keyword, name);
}

module.exports = {
  autoAddressFromKeyword,
  autoStreetAddressFromKeyword,
  resolveVendorAddress,
};
