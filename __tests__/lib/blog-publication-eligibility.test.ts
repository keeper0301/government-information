import { describe, expect, it } from "vitest";
import { hasUnfinishedAmount, isBlogPublic, publicBlogQuery } from "@/lib/blog/publication-eligibility";
describe("publication eligibility", () => {
  const approved = {published_at:"2026-10-13",admin_reviewed_at:"2026-10-13",admin_review_required:false};
  it.each(["title","content","meta_description","category","cover_image"])("checks %s", field => {
    expect(isBlogPublic({...approved,[field]:"최대 N만원"})).toBe(false);
  });
  it("checks tags and nested FAQ", () => {
    expect(hasUnfinishedAmount({tags:["N만원"]})).toBe(true);
    expect(hasUnfinishedAmount({faqs:[{question:"얼마?",answer:"N만 원"}]})).toBe(true);
  });
  it.each([{published_at:null},{admin_reviewed_at:null},{admin_review_required:true},{admin_review_required:null}])("fails closed %j", state => {
    expect(isBlogPublic({...approved,...state})).toBe(false);
  });
  it("retains reviewed legacy publications", () => expect(isBlogPublic({...approved,title:"100만원"})).toBe(true));
  it("filters rows before limit and count", () => {
    let rows = [approved,{...approved,published_at:null},{...approved,admin_reviewed_at:null},{...approved,admin_review_required:true}];
    const query = {
      eq(key:string,value:boolean){ rows=rows.filter(r=>r[key as keyof typeof r]===value);return query;},
      not(key:string,_op:string,value:null){rows=rows.filter(r=>r[key as keyof typeof r]!==value);return query;},
    };
    publicBlogQuery(query);
    expect(rows).toEqual([approved,{...approved,admin_reviewed_at:null}]);
  });
});
