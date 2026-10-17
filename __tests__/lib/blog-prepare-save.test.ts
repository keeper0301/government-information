import {describe,expect,it,vi} from "vitest";
vi.mock("@/lib/llm/text",()=>({callLLM:vi.fn(),parseJSONResponse:JSON.parse}));
import {prepareBlogSave} from "@/lib/blog/prepare-save";
const latest={title:"100만원",content:"본문",meta_description:null,tags:[],faqs:[],category:null,cover_image:null,published_at:"2026-01-01",admin_review_required:false,admin_review_score:null,admin_reviewed_at:null,updated_at:"v1"};
const pass={score:4,needsReview:false,reason:"OK",improvements:[]};
describe("saving without hiding the existing public version",()=>{
 it("unchanged public save is a no-op without review",async()=>{const review=vi.fn();expect(await prepareBlogSave(latest,{title:latest.title},"v1",review)).toBeNull();expect(review).not.toHaveBeenCalled();});
 it("treats empty tags and null as an unchanged form save",async()=>{const review=vi.fn();expect(await prepareBlogSave(latest,{tags:null},"v1",review)).toBeNull();expect(review).not.toHaveBeenCalled();});
 it("reviews the replacement, preserves publication time, and includes FAQ",async()=>{const review=vi.fn().mockResolvedValue(pass);const row={...latest,faqs:[{answer:"100만원"}]};const patch=await prepareBlogSave(row,{title:"200만원"},"v1",review);expect(patch).toMatchObject({title:"200만원",admin_review_required:false});expect(patch).not.toHaveProperty("published_at");expect(review.mock.calls[0][0].faqs).toEqual(row.faqs);expect(row.title).toBe("100만원");});
 it.each(["title","content","meta_description","tags","faqs"])("rejects placeholder in %s without changing the public row",async field=>{const review=vi.fn();const value=field==="tags"?["N만원"]:field==="faqs"?[{answer:"N만원"}]:"N만원";await expect(prepareBlogSave(latest,{[field]:value},"v1",review)).rejects.toThrow("기존 공개본");expect(review).not.toHaveBeenCalled();expect(latest.published_at).toBe("2026-01-01");});
 it("holds rejected replacement without hiding old public content",async()=>{await expect(prepareBlogSave(latest,{content:"수정본"},"v1",vi.fn().mockResolvedValue({...pass,needsReview:true}))).rejects.toThrow("기존 공개본");expect(latest.admin_review_required).toBe(false);});
 it("propagates review exception without a writable patch",async()=>{await expect(prepareBlogSave(latest,{content:"수정본"},"v1",vi.fn().mockRejectedValue(new Error("offline")))).rejects.toThrow("offline");});
 it("rejects stale editor snapshots before review",async()=>{const review=vi.fn();await expect(prepareBlogSave(latest,{content:"수정본"},"old",review)).rejects.toThrow("새로고침");expect(review).not.toHaveBeenCalled();});
 it.each([{published_at:null},{admin_review_required:true},{admin_review_score:2}])("does not release draft/held state %j on save",async state=>{const patch=await prepareBlogSave({...latest,...state},{title:"새 제목"},"v1",vi.fn());expect(patch).toMatchObject({admin_review_required:true,admin_reviewed_at:null});expect(patch).not.toHaveProperty("published_at");});
});
