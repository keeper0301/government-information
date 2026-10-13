import type { EditorialNewsPhoto } from "@/lib/editorial-news-images";

export function EditorialPhotoCredit({ photo }: { photo: EditorialNewsPhoto }) {
  return <p className="text-xs text-grey-600 mt-2 leading-relaxed">
    {photo.caption} · 기사 현장 사진이 아닙니다. 사진 속 지역은 정책 대상 지역을 뜻하지 않습니다.
    {" 사진: "}{photo.author}{" · "}
    <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">사진 출처</a>
    {" · "}<a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">{photo.licenseName}</a>
    {" · 크기·형식 변경, 카드에서 일부 잘림"}
  </p>;
}

export function EditorialPhotoFigure({ photo }: { photo: EditorialNewsPhoto }) {
  return <figure className="mb-8">
    {/* 이용 허가를 확인하고 미리 압축한 사진으로 화면 크기에 맞는 파일을 제공합니다. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={photo.url} alt={photo.alt} width={photo.width} height={photo.height}
      srcSet={`${photo.url.replace(".webp", "-480.webp")} 480w, ${photo.url.replace(".webp", "-640.webp")} 640w, ${photo.url} ${photo.width}w`}
      sizes="(max-width: 767px) calc(100vw - 48px), 720px"
      decoding="async" className="w-full aspect-[16/9] object-cover rounded-2xl bg-grey-100" />
    <figcaption><EditorialPhotoCredit photo={photo} /></figcaption>
  </figure>;
}
