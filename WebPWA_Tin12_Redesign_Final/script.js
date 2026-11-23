'use strict';
/* TIN12 • Study Space. Không dùng CDN, không thu thập dữ liệu người học. */
const $ = id => document.getElementById(id);
const STORAGE_KEY = 'tin12-study-custom-v3';
const STORAGE_TITLE = 'tin12-study-title-v3';
const POINT_MC = 0.25;
const TF_TABLE = [0, 0.1, 0.25, 0.5, 1];
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const state = {
  questions: [], examTitle: '', isCustom: false,
  currentIndex: 0, answers: [], grades: [], completed: false,
  page: 'home', importTab: 'docx', selectedFile: null, docxText: '', candidate: null,
  lastResult: null
};
const scoreNumber = num => Number(num).toFixed(2);
const maxScoreFor = qs => qs.reduce((total, q) => total + (q.type === 'true_false' ? 1 : POINT_MC), 0);
const rawEarned = () => state.grades.reduce((total, value) => total + (value ?? 0), 0);
const completedCount = () => state.grades.filter(value => value !== null).length;
const currentQuestion = () => state.questions[state.currentIndex];
const cleanText = text => String(text ?? '').replace(/\u00a0/g, ' ').trim();

function showToast(message) {
  const el = $('global-toast');
  el.textContent = message;
  el.classList.remove('hidden');
  // Ẩn khi người dùng tiếp tục thao tác; không phụ thuộc timer cho nghiệp vụ.
}
function hideToast() { $('global-toast').classList.add('hidden'); }
function screenName(page) { return ({home:'Ôn tập',quiz:'Làm bài',import:'Nạp đề',result:'Kết quả'})[page] || 'Ôn tập'; }
function navigate(page) {
  if (page === 'result' && !state.completed) {
    showToast('Bạn cần hoàn thành lượt làm bài để xem kết quả.');
    return;
  }
  hideToast(); state.page = page;
  document.querySelectorAll('.screen').forEach(section => section.classList.toggle('hidden', section.id !== 'screen-' + page));
  $('breadcrumb-current').textContent = screenName(page);
  document.querySelectorAll('[data-screen]').forEach(button => {
    const active = button.dataset.screen === page || (page === 'quiz' && button.dataset.screen === 'home');
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  window.scrollTo({top:0,behavior:'instant'});
}
function updateBankDisplay() {
  $('home-exam-title').textContent = state.examTitle || 'Chưa có dữ liệu câu hỏi';
  $('home-exam-description').textContent = state.isCustom
    ? 'Bộ đề riêng đã lưu trên thiết bị, có thể sử dụng lại khi ngoại tuyến.'
    : 'Mười câu Mạng máy tính và mười câu Hệ cơ sở dữ liệu.';
  $('home-count').textContent = state.questions.length || '—';
  $('home-source-badge').textContent = state.isCustom ? 'ĐỀ ĐƯỢC NẠP TỪ THIẾT BỊ' : 'ĐỀ MẶC ĐỊNH';
  ['home-restore','import-restore'].forEach(id => $(id).classList.toggle('hidden',!state.isCustom));
  ['home-start','home-secondary-start'].forEach(id => $(id).disabled = state.questions.length === 0);
}
function validateQuestions(items, expectedLength = null) {
  const errors = [];
  if (!Array.isArray(items)) return ['Dữ liệu không phải mảng câu hỏi.'];
  if (!items.length) return ['Đề không có câu hỏi.'];
  if (expectedLength !== null && items.length !== expectedLength) errors.push(`Cần đúng ${expectedLength} câu, hiện có ${items.length}.`);
  const ids = new Set();
  items.forEach((q,i) => {
    const p = `Câu ${i+1}`;
    if (!q || typeof q !== 'object') {errors.push(`${p}: dữ liệu không hợp lệ.`);return;}
    if (ids.has(q.id)) errors.push(`${p}: ID câu hỏi trùng.`); ids.add(q.id);
    if (!cleanText(q.question)) errors.push(`${p}: thiếu nội dung câu hỏi.`);
    if (!cleanText(q.explanation)) errors.push(`${p}: thiếu giải thích.`);
    if (q.type === 'multiple_choice') {
      if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(s => !cleanText(s))) errors.push(`${p}: trắc nghiệm phải có đủ 4 lựa chọn.`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) errors.push(`${p}: chỉ số đáp án A–D không hợp lệ.`);
    } else if(q.type === 'true_false') {
      if (!Array.isArray(q.items) || q.items.length !== 4 || q.items.some(x => !x || !cleanText(x.statement) || typeof x.answer !== 'boolean')) errors.push(`${p}: Đúng/Sai cần đủ 4 ý, có đáp án boolean.`);
    } else errors.push(`${p}: loại câu hỏi không được hỗ trợ.`);
  });
  return errors;
}
async function initializeBank() {
  let loaded = null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const candidate = JSON.parse(stored);
      if (validateQuestions(candidate).length === 0) {
        loaded = candidate; state.isCustom = true;
        state.examTitle = localStorage.getItem(STORAGE_TITLE) || `Đề đã nạp (${candidate.length} câu)`;
      }
    }
  } catch (e) { console.warn('Đề đã lưu không hợp lệ:', e); }
  if (!loaded) {
    try {
      const response = await fetch('./questions.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const bank = await response.json();
      const errors = validateQuestions(bank,20);
      if (errors.length) throw new Error(errors.join(' '));
      loaded = bank;
      state.examTitle = `Ngân hàng mặc định (${bank.length} câu)`;
      state.isCustom = false;
    } catch (e) {
      $('home-exam-description').textContent = 'Không tải được ngân hàng mặc định: ' + e.message;
      showToast('Không tải được questions.json. Vui lòng truy cập qua HTTPS hoặc máy chủ cục bộ.');
    }
  }
  state.questions = loaded || [];
  updateBankDisplay();
}
function beginQuiz(shuffle = false) {
  if (!state.questions.length) return showToast('Chưa có câu hỏi để ôn tập.');
  if (shuffle) {
    for (let i=state.questions.length-1; i>0; i--) {
      const j=Math.floor(Math.random()*(i+1));
      [state.questions[i],state.questions[j]]=[state.questions[j],state.questions[i]];
    }
  }
  state.currentIndex=0;
  state.answers=Array(state.questions.length).fill(null);
  state.grades=Array(state.questions.length).fill(null);
  state.completed=false;
  $('quiz-exam-name').textContent=state.examTitle;
  renderQuestion();
  navigate('quiz');
}
function updateProgress() {
  const n=state.questions.length, done=completedCount(), pct=n ? 100*done/n : 0;
  $('progress-percent').textContent=`${Math.round(pct)}%`;
  $('progress-count').textContent=`${done} / ${n}`;
  $('progress-fill').style.width=`${pct}%`;
  $('progress-outer').setAttribute('aria-valuenow', String(Math.round(pct)));
  $('current-score').textContent=scoreNumber(rawEarned());
  $('max-score-note').textContent=`Điểm thô / ${scoreNumber(maxScoreFor(state.questions))} tối đa`;
}
function renderQuestion() {
  const q=currentQuestion(); if (!q) return;
  const idx=state.currentIndex;
  const submitted=state.grades[idx]!==null;
  $('question-ordinal').textContent=String(idx+1).padStart(2,'0');
  $('question-of').textContent=`/ ${state.questions.length}`;
  $('question-topic').textContent=q.topic || 'Tin học 12';
  $('question-type').textContent=q.type==='true_false'?'Đúng / Sai':'Trắc nghiệm A–D';
  $('question-text').textContent=q.question;
  $('question-instruction').textContent=q.type==='true_false'?'Đánh dấu Đúng hoặc Sai cho đủ cả bốn nhận định.':'Chọn một phương án chính xác nhất.';
  $('quiz-alert').classList.add('hidden');
  $('btn-submit').classList.toggle('hidden',submitted);
  $('btn-next').classList.toggle('hidden',!submitted);
  $('btn-next').textContent=idx===state.questions.length-1?'Xem kết quả ↗':'Câu tiếp theo ↗';
  const container=$('options-container'); container.replaceChildren();
  if(q.type==='true_false') renderTrueFalse(q,container,submitted);
  else renderMultipleChoice(q,container,submitted);
  if(submitted) renderExplanation(q,state.grades[idx]);
  else $('answer-feedback').classList.add('hidden');
  updateProgress();
}
function renderMultipleChoice(q, container, submitted) {
  q.options.forEach((option,index) => {
    const chosen=state.answers[state.currentIndex]===index;
    const button=document.createElement('button');button.type='button';
    button.className='option';
    if(chosen) button.classList.add('selected');
    if(submitted && index===q.answer) button.classList.add('correct');
    if(submitted && chosen && index!==q.answer) button.classList.add('incorrect');
    button.setAttribute('aria-pressed',String(chosen));button.disabled=submitted;
    const k=document.createElement('span');k.className='option-key';k.textContent=String.fromCharCode(65+index);
    const value=document.createElement('span');value.textContent=option;
    button.append(k,value);
    if(submitted && (index===q.answer || (chosen && index!==q.answer))) {
      const mark=document.createElement('span');mark.className='answer-tag';mark.textContent=index===q.answer?'ĐÚNG':'SAI';button.append(mark);
    }
    button.addEventListener('click',() => {
      state.answers[state.currentIndex]=index;
      renderQuestion();
    });
    container.append(button);
  });
}
function renderTrueFalse(q,container,submitted) {
  if (!Array.isArray(state.answers[state.currentIndex])) state.answers[state.currentIndex]=[null,null,null,null];
  const arr=state.answers[state.currentIndex];
  q.items.forEach((item,i) => {
    const row=document.createElement('div');row.className='tf-row';
    const statement=document.createElement('div');statement.className='tf-statement';
    const marker=document.createElement('b'); marker.textContent=String.fromCharCode(97+i)+')';
    const detail=document.createElement('span');detail.textContent=item.statement;
    statement.append(marker,detail);
    if(submitted){
      const correct=arr[i]===item.answer;
      row.classList.add(correct?'tf-row-correct':'tf-row-wrong');
      const result=document.createElement('span');result.className='tf-result'+(correct?'':' wrong');
      result.textContent=correct?'Bạn trả lời đúng':'Đáp án đúng: '+(item.answer?'Đúng':'Sai');statement.append(result);
    }
    const choices=document.createElement('div');choices.className='tf-choice';choices.setAttribute('role','group');choices.setAttribute('aria-label',`Ý ${item.label || String.fromCharCode(97+i)}`);
    [true,false].forEach(value=>{
      const selected=arr[i]===value;
      const button=document.createElement('button');button.type='button';button.className='tf-btn';
      button.textContent=value?'Đúng':'Sai';button.setAttribute('aria-pressed',String(selected));button.disabled=submitted;
      if(submitted && value===item.answer) button.classList.add('tf-correct');
      if(submitted && selected && value!==item.answer) button.classList.add('tf-wrong');
      button.addEventListener('click',()=>{arr[i]=value;renderQuestion();});
      choices.append(button);
    });
    row.append(statement,choices);container.append(row);
  });
}
function gradeQuestion(q,answer) {
  if(q.type==='multiple_choice') return answer===q.answer ? POINT_MC : 0;
  const correct=q.items.reduce((n,item,i)=>n+(answer[i]===item.answer?1:0),0);
  return TF_TABLE[correct];
}
function submitAnswer() {
  const q=currentQuestion(); if (!q || state.grades[state.currentIndex]!==null) return;
  const answer=state.answers[state.currentIndex];
  let error='';
  if(q.type==='true_false' && (!Array.isArray(answer) || answer.some(x => typeof x!=='boolean'))) error='Hãy chọn Đúng hoặc Sai cho đủ cả 4 ý.';
  if(q.type==='multiple_choice' && !Number.isInteger(answer)) error='Hãy chọn một trong bốn đáp án A, B, C, D.';
  if(error){$('quiz-alert').textContent=error;$('quiz-alert').classList.remove('hidden');return;}
  state.grades[state.currentIndex]=gradeQuestion(q,answer);
  renderQuestion();
}
function renderExplanation(q,points) {
  $('feedback-heading').textContent=q.type==='multiple_choice'
    ? (points===POINT_MC?'Bạn đã chọn chính xác.':'Đáp án chưa chính xác.')
    : 'Đã chấm xong 4 nhận định.';
  $('feedback-score').textContent=`Điểm đạt ở câu này: ${scoreNumber(points)} / ${q.type==='true_false'?'1.00':'0.25'} điểm thô.`;
  $('explanation-text').textContent=q.explanation || 'Đề nhập không cung cấp lời giải.';
  $('answer-feedback').classList.remove('hidden');
}
function nextQuestion() {
  if (state.grades[state.currentIndex] === null) return;
  if(state.currentIndex < state.questions.length-1){state.currentIndex++;renderQuestion();window.scrollTo({top:0,behavior:'instant'});}
  else finishQuiz();
}
function finishQuiz() {
  const max=maxScoreFor(state.questions);const earned=rawEarned();
  const normal=max ? earned/max*10 : 0;
  state.completed=true;
  state.lastResult={max,earned,normal,total:state.questions.length,completed:completedCount()};
  $('final-score').textContent=scoreNumber(normal);
  $('stat-total').textContent=String(state.questions.length);
  $('stat-completed').textContent=String(completedCount());
  $('stat-percent').textContent=`${Math.round(100*earned/max)}%`;
  $('stat-raw').textContent=`${scoreNumber(earned)} / ${scoreNumber(max)}`;
  $('result-subtitle').textContent=state.examTitle;
  $('result-evaluation').textContent=normal>=8?'Bạn đã nắm vững phần lớn nội dung.':normal>=5?'Bạn đang tiến bộ. Tiếp tục luyện tập nhé.':'Xem lại lời giải và thử lại để cải thiện kết quả.';
  navigate('result');
}
function setImportTab(tab) {
  state.importTab=tab;
  ['docx','text'].forEach(t=>{
    const selected=t===tab;
    $('tab-'+t).classList.toggle('active',selected);
    $('tab-'+t).setAttribute('aria-selected',String(selected));
    $(t==='docx'?'docx-area':'text-area').classList.toggle('hidden',!selected);
  });
  clearParsed();
}
function clearParsed() {
  state.candidate=null;$('import-preview').classList.add('hidden');
  $('import-confirm').classList.add('hidden');
  $('import-message').classList.add('hidden');
}
function importStatus(message,kind='info') {
  $('import-message').className='import-message '+kind;
  $('import-message').textContent=message;
}
async function docxToText(file) {
  if(!window.JSZip) throw new Error('Thiếu thư viện JSZip cục bộ.');
  if(!/\.docx$/i.test(file.name)) throw new Error('Chỉ hỗ trợ tệp Word định dạng .docx.');
  if(file.size>12*1024*1024) throw new Error('Tệp quá lớn (giới hạn 12 MB).');
  const zip=await JSZip.loadAsync(await file.arrayBuffer(),{checkCRC32:true});
  const xmlFile=zip.file('word/document.xml');
  if(!xmlFile) throw new Error('Không tìm thấy word/document.xml trong tệp Word.');
  const xml=await xmlFile.async('string');
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.getElementsByTagName('parsererror').length) throw new Error('Cấu trúc XML Word bị lỗi.');
  const body=doc.getElementsByTagNameNS(W_NS,'body')[0];
  if(!body) throw new Error('Không tìm thấy phần nội dung Word.');
  const paras=Array.from(body.getElementsByTagNameNS(W_NS,'p'));
  const lines=paras.map(p=>{
    const texts=[];
    // Duyệt node con theo thứ tự, giữ ngắt dòng, tab và text có định dạng (run).
    const walk=node=>{
      for(const child of node.childNodes){
        if(child.nodeType!==1) continue;
        if(child.namespaceURI===W_NS && child.localName==='t') texts.push(child.textContent || '');
        else if(child.namespaceURI===W_NS && child.localName==='tab') texts.push('\t');
        else if(child.namespaceURI===W_NS && (child.localName==='br'||child.localName==='cr')) texts.push('\n');
        else walk(child);
      }
    };
    walk(p);return texts.join('');
  }).filter(x=>x.trim());
  if(!lines.length) throw new Error('Tệp không có văn bản có thể trích xuất (ảnh cần OCR riêng).');
  return lines.join('\n');
}
async function onFileSelected(event) {
  const file=event.target.files?.[0];
  state.selectedFile=file || null;state.docxText='';clearParsed();
  $('selected-file').textContent=file?file.name:'Chưa có tệp nào được chọn';
  if(!file) return;
  importStatus('Đang đọc nội dung Word...','info');
  try {
    const content=await docxToText(file);
    if(state.selectedFile!==file) return;
    state.docxText=content;
    importStatus(`Đã đọc “${file.name}”. Bấm “Phân tích đề thi” để kiểm tra câu hỏi và đáp án.`,'success');
  }catch(error) {importStatus('Không thể đọc Word: '+error.message,'error');}
}
function truthValue(s) {const txt=String(s).trim().toLocaleLowerCase('vi');return ['đúng','đ','true','t'].includes(txt)?true:['sai','s','false','f'].includes(txt)?false:null;}
/* Hàm thuần: dành chung cho văn bản dán và nội dung trích xuất từ .docx. */
function parseExamText(raw) {
  const text=String(raw||'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ');
  const matches=[...text.matchAll(/(?:^|\n)\s*(?:Câu\s*\d+\s*[:.)-]|\d+\s*[.):-])\s*/giu)];
  const parsed=[];const errors=[];
  if(!matches.length) return {questions:[],errors:['Không tìm thấy đầu câu theo mẫu “Câu 1:” hoặc “1.”.']};
  if(matches.length>300) return {questions:[],errors:['Đề vượt quá giới hạn 300 câu cho một lần nạp.']};
  for(let i=0;i<matches.length;i++){
    const number=i+1;
    let block=text.slice(matches[i].index+matches[i][0].length,i+1<matches.length?matches[i+1].index:text.length).trim();
    const x=block.match(/(?:^|\n)\s*(?:Giải thích|Lời giải)\s*[:：]\s*/i);
    let explanation='';
    if(x){explanation=cleanText(block.slice(x.index+x[0].length));block=block.slice(0,x.index).trim();}
    else explanation='Đề nhập không cung cấp lời giải.';
    if(!block){errors.push(`Câu ${number}: không có nội dung.`);continue;}
    const isTF=/(?:^|\n)\s*a\s*[).]\s*\S/m.test(block);
    if(isTF){
      const answerLine=block.match(/(?:^|\n)\s*(?:Đáp án|Đ\/A)\s*[:：]\s*([^\n]*)/i);
      const map=new Map();
      if(answerLine){
        for(const m of answerLine[1].matchAll(/([a-d])\s*[-:=]\s*(Đúng|Sai|Đ|S|True|False)(?=\s*(?:[,;]|$))/giu)){
          map.set(m[1].toLowerCase(),truthValue(m[2]));
        }
        block=block.slice(0,answerLine.index)+block.slice(answerLine.index+answerLine[0].length);
      }
      const labels=[...block.matchAll(/(?:^|\n)\s*([a-d])\s*[).]\s*/gm)];
      if(labels.length!==4 || labels.map(m=>m[1].toLowerCase()).join('')!=='abcd'){
        errors.push(`Câu ${number}: cần đúng bốn nhận định a), b), c), d).`);continue;
      }
      const question=cleanText(block.slice(0,labels[0].index));
      const items=[];let bad=false;
      labels.forEach((m,k)=>{
        let statement=cleanText(block.slice(m.index+m[0].length,k<3?labels[k+1].index:block.length));
        const inline=statement.match(/\(\s*(Đúng|Sai|Đ|S|True|False)\s*\)\s*$/iu);
        const label=m[1].toLowerCase();
        const value=inline?truthValue(inline[1]):(map.has(label)?map.get(label):null);
        if(inline) statement=cleanText(statement.slice(0,inline.index));
        if(!statement || value===null){errors.push(`Câu ${number}, ý ${label}: thiếu nội dung hoặc đáp án Đúng/Sai.`);bad=true;}
        items.push({label,statement,answer:value});
      });
      if(!question){errors.push(`Câu ${number}: thiếu đoạn dẫn.`);bad=true;}
      if(!bad) parsed.push({id:number,type:'true_false',topic:'Tin học 12 · Đề nhập',question,items,explanation});
    }else{
      const key=block.match(/(?:^|\n)\s*(?:Đáp án|Đ\/A|Key)\s*[:：]\s*([A-D])\s*(?=\n|$)/i);
      if(!key){errors.push(`Câu ${number}: thiếu đáp án A, B, C hoặc D.`);continue;}
      const answer=key[1].toUpperCase().charCodeAt(0)-65;
      block=block.slice(0,key.index)+block.slice(key.index+key[0].length);
      const labels=[...block.matchAll(/(?:^|\n|\s{2,}|\s(?=[A-D][.)]\s))([A-D])[.)]\s+/gm)];
      if(labels.length!==4 || labels.map(m=>m[1]).join('')!=='ABCD'){
        errors.push(`Câu ${number}: cần đủ bốn phương án A., B., C., D. theo thứ tự.`);continue;
      }
      const question=cleanText(block.slice(0,labels[0].index));
      const options=labels.map((m,k)=>cleanText(block.slice(m.index+m[0].length,k<3?labels[k+1].index:block.length)));
      if(!question || options.some(x=>!x)){
        errors.push(`Câu ${number}: câu hỏi hoặc phương án bị trống.`);continue;
      }
      parsed.push({id:number,type:'multiple_choice',topic:'Tin học 12 · Đề nhập',question,options,answer,explanation});
    }
  }
  return {questions:parsed,errors};
}
function analyzeImport() {
  state.candidate=null;$('import-preview').classList.add('hidden');$('import-confirm').classList.add('hidden');
  const source=state.importTab==='docx'?state.docxText:$('paste-text').value;
  if(!cleanText(source)) return importStatus(state.importTab==='docx'?'Vui lòng chọn một tệp Word hợp lệ trước.':'Vui lòng dán nội dung đề thi trước.','error');
  const output=parseExamText(source);
  if(output.errors.length){
    const detail=output.errors.slice(0,8).join('\n');
    importStatus(`Phát hiện ${output.errors.length} lỗi. Chưa nạp để tránh mất đề cũ.\n${detail}${output.errors.length>8?'\n...':''}`,'error');
    return;
  }
  const errors=validateQuestions(output.questions);
  if(errors.length){importStatus('Dữ liệu chưa hợp lệ:\n'+errors.join('\n'),'error');return;}
  state.candidate=output.questions;
  const mc=output.questions.filter(x=>x.type==='multiple_choice').length;
  const tf=output.questions.length-mc;
  $('import-preview-count').textContent=`${output.questions.length} câu hợp lệ`;
  $('import-preview-detail').textContent=`${mc} câu trắc nghiệm A–D · ${tf} câu Đúng/Sai. Đề hiện hành chỉ được thay khi bạn xác nhận.`;
  $('import-preview').classList.remove('hidden');
  $('import-confirm').classList.remove('hidden');
  importStatus('Phân tích thành công. Kiểm tra số câu, sau đó chọn “Sử dụng đề này”.','success');
}
function confirmImport() {
  const candidate=state.candidate;if(!candidate)return;
  const title=state.importTab==='docx'?`Đề Word: ${state.selectedFile?.name||'Đã nạp'}`:'Đề văn bản đã nạp';
  try {
    localStorage.setItem(STORAGE_KEY,JSON.stringify(candidate));
    localStorage.setItem(STORAGE_TITLE,`${title} (${candidate.length} câu)`);
  }catch(e){importStatus('Không lưu được vào thiết bị (bộ nhớ đầy hoặc chế độ riêng tư). Đề cũ được giữ nguyên. '+e.message,'error');return;}
  state.questions=candidate;
  state.isCustom=true;
  state.examTitle=`${title} (${candidate.length} câu)`;
  clearParsed();updateBankDisplay();beginQuiz();
}
async function restoreDefaults() {
  if(!state.isCustom)return;
  if(!window.confirm('Khôi phục bộ 20 câu mặc định? Đề đã nạp sẽ bị xóa khỏi bộ nhớ cục bộ.'))return;
  let bank;
  try{
    const res=await fetch('./questions.json');if(!res.ok)throw Error('HTTP '+res.status);
    bank=await res.json();
    const errors=validateQuestions(bank,20);if(errors.length)throw Error(errors.join('; '));
  }catch(error){showToast('Chưa khôi phục được: '+error.message);return;}
  try {localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(STORAGE_TITLE);}
  catch(error){showToast('Không thể sửa bộ nhớ cục bộ: '+error.message);return;}
  state.questions=bank;state.isCustom=false;state.examTitle=`Ngân hàng mặc định (${bank.length} câu)`;
  state.completed=false;state.lastResult=null;updateBankDisplay();navigate('home');showToast('Đã khôi phục ngân hàng 20 câu mặc định.');
}
function updateNetworkStatus(){
  const online=navigator.onLine;
  $('connection-label').textContent=online?'Đang kết nối Internet':'Đang ngoại tuyến';
  $('network-dot').classList.toggle('offline',!online);
  $('top-status').classList.toggle('offline',!online);
  $('top-status-text').textContent=online?'TRỰC TUYẾN':'NGOẠI TUYẾN';
}
async function updateOfflineReady(){
  if(!('serviceWorker'in navigator) || !('caches'in window)){$('cache-label').textContent='Trình duyệt không hỗ trợ đầy đủ PWA';return;}
  try{
    const keys=await caches.keys();
    $('cache-label').textContent=keys.some(k=>k.startsWith('tin12-study-space-v3'))?'Tài nguyên đã được lưu để học offline':'Cần mở trang online để tải đủ tài nguyên';
  }catch(e){$('cache-label').textContent='Chưa xác nhận được trạng thái bộ nhớ';}
}
async function registerPWA(){
  if(!('serviceWorker'in navigator)) return;
  try{
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    await updateOfflineReady();
  }catch(e){$('cache-label').textContent='Không thể cài bộ nhớ offline: '+e.message;}
}
function bindUI(){
  document.querySelectorAll('[data-screen]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.screen)));
  document.querySelectorAll('[data-open-import]').forEach(el=>el.addEventListener('click',()=>navigate('import')));
  ['home-start','home-secondary-start'].forEach(id=>$(id).addEventListener('click',()=>beginQuiz()));
  $('btn-quit').addEventListener('click',()=>navigate('home'));
  $('btn-submit').addEventListener('click',submitAnswer);$('btn-next').addEventListener('click',nextQuestion);
  $('result-restart').addEventListener('click',()=>beginQuiz());
  $('result-shuffle').addEventListener('click',()=>beginQuiz(true));
  $('tab-docx').addEventListener('click',()=>setImportTab('docx'));
  $('tab-text').addEventListener('click',()=>setImportTab('text'));
  $('docx-input').addEventListener('change',onFileSelected);
  $('paste-text').addEventListener('input',clearParsed);
  $('import-parse').addEventListener('click',analyzeImport);
  $('import-confirm').addEventListener('click',confirmImport);
  $('import-cancel').addEventListener('click',()=>navigate('home'));
  ['home-restore','import-restore'].forEach(id=>$(id).addEventListener('click',restoreDefaults));
  $('global-toast').addEventListener('click',hideToast);
  window.addEventListener('online',updateNetworkStatus);
  window.addEventListener('offline',updateNetworkStatus);
}
document.addEventListener('DOMContentLoaded',async()=>{
  bindUI(); updateNetworkStatus();
  await initializeBank();
  registerPWA();
});
