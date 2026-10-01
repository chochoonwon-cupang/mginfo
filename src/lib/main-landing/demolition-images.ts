export const DEFAULT_DEMOLITION_IMAGE_FOLDER = "https://image.cattery.co.kr/chul";

export function defaultDemolitionImageUrls(max = 12): string[] {
  const n = Math.min(Math.max(1, max), 24);
  return Array.from({ length: n }, (_, i) => {
    const num = String(i + 1).padStart(2, "0");
    return `${DEFAULT_DEMOLITION_IMAGE_FOLDER}/${num}.webp`;
  });
}
