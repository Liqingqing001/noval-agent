"""Restore PPT internal jump buttons in the PDF backup after LibreOffice export."""
from pathlib import Path
import fitz
from pptx import Presentation
from pptx.enum.action import PP_ACTION
r=Path(__file__).resolve().parents[1]/'deliverables'
ppt=Presentation(r/'NovelAgent-Pages-Defense.pptx');p=r/'NovelAgent-Pages-Defense.pdf';pdf=fitz.open(p)
positions={s.part.partname:i for i,s in enumerate(ppt.slides)};n=0
for i,s in enumerate(ppt.slides):
 page=pdf[i]
 for sh in s.shapes:
  if sh.click_action.action==PP_ACTION.NAMED_SLIDE:
   target=positions[sh.click_action.target_slide.part.partname]
   rect=fitz.Rect(sh.left/ppt.slide_width*page.rect.width,sh.top/ppt.slide_height*page.rect.height,(sh.left+sh.width)/ppt.slide_width*page.rect.width,(sh.top+sh.height)/ppt.slide_height*page.rect.height)
   page.insert_link({'kind':fitz.LINK_GOTO,'from':rect,'page':target,'to':fitz.Point(0,0)});n+=1
out=p.with_name('navigation-temp.pdf');pdf.save(out,garbage=4,deflate=True);pdf.close();out.replace(p);print('PDF internal jump annotations:',n)
