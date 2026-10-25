"""Use the skill renderer's PNG pipeline with an already verified native Word PDF conversion."""
from pathlib import Path
import importlib.util
import shutil
import sys
import os

if len(sys.argv) != 5:
    raise SystemExit('Usage: py render_from_word_pdf.py SKILL_ROOT DOCX WORD_PDF OUTPUT_DIR')
skill, source, pdf, output = map(Path, sys.argv[1:])
spec = importlib.util.spec_from_file_location('document_skill_renderer',skill/'render_docx.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
pdf = pdf.resolve()
def native_pdf(doc_path, user_profile, convert_tmp_dir, stem, verbose=False):
    target = Path(convert_tmp_dir)/(stem+'.pdf')
    shutil.copy2(pdf,target)
    return str(target),'Rendered with installed Microsoft Word; LibreOffice unavailable.'
renderer.convert_to_pdf = native_pdf
poppler=Path(sys.executable).parent.parent/'native'/'poppler'/'Library'/'bin'
os.environ['PATH']=str(poppler)+os.pathsep+os.environ.get('PATH','')
sys.argv=[str(skill/'render_docx.py'),str(source),'--output_dir',str(output),'--dpi','150']
renderer.main()
