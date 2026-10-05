// 강원 보도자료의 새 한글 문서 첨부에서 실제 문장만 추출합니다.
import JSZip from "jszip";
import { load } from "cheerio";

export async function readGangwonHwpx(buffer: Buffer): Promise<string | null> {
  const archive = await JSZip.loadAsync(buffer);
  const sections = Object.keys(archive.files)
    .filter(name => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/section(\d+)/i)?.[1]) - Number(b.match(/section(\d+)/i)?.[1]));
  const paragraphs: string[] = [];
  for (const name of sections) {
    const xml = await archive.files[name].async("string");
    const $ = load(xml, { xmlMode: true });
    // 문서의 사진·설정·서식정보는 제외하고 문장 태그만 순서대로 읽습니다.
    $("hp\\:t").each((_, element) => { paragraphs.push($(element).text()); });
  }
  const text = paragraphs.join(" ").replace(/\s+/g, " ").trim();
  return text.length >= 250 && /[가-힣]/.test(text) ? text.slice(0, 20000) : null;
}
