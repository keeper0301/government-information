import {describe,expect,it} from "vitest";
import {isBlogReadable,isBlogPublicationApproved} from "@/lib/blog/publication-eligibility";
describe("legacy public compatibility without new publication bypass",()=>{
 const legacy={title:"2026년 지원금 100만원",content:"정상 본문",meta_description:null,tags:[],faqs:[],category:null,cover_image:null,published_at:"2026-01-01",admin_review_required:false,admin_reviewed_at:null,admin_review_score:null};
 it("keeps already-public unreviewed legacy defaults",()=>expect(isBlogReadable(legacy)).toBe(true));
 it("cannot explicitly publish an unreviewed draft",()=>expect(isBlogPublicationApproved({...legacy,published_at:null})).toBe(false));
 it.each([{admin_review_required:true},{admin_review_score:2},{admin_review_score:3},{published_at:null},{title:"N만원"},{content:"<img alt='N만원'>"},{faqs:[{answer:"N만 원"}]}])("keeps unsafe state blocked %j",state=>expect(isBlogReadable({...legacy,...state})).toBe(false));
 it("does not infer legacy approval from missing selected fields",()=>expect(isBlogReadable({title:"정상",published_at:"2026-01-01",admin_review_required:false})).toBe(false));
 it("keeps reviewed safe public rows",()=>expect(isBlogReadable({...legacy,admin_reviewed_at:"2026-10-13",admin_review_score:4})).toBe(true));
});
