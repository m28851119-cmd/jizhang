// 两级分类数据（与 CLAUDE.md 分类体系一致）
const CATEGORIES = {
  '餐饮饮食': ['早餐', '午餐', '晚餐', '夜宵', '买菜做饭', '零食水果', '咖啡奶茶', '外卖', '其他'],
  '交通出行': ['公交地铁', '打车', '火车高铁', '飞机', '加油充电', '停车费', '共享单车', '其他'],
  '购物消费': ['服饰鞋包', '数码家电', '日用百货', '美妆个护', '烟酒', '宠物相关', '母婴用品', '其他'],
  '居住日常': ['房租房贷', '水电燃气', '物业费', '家具家居', '维修保养', '家政保洁', '其他'],
  '通讯网络': ['手机话费', '宽带网络', '影音会员', '软件订阅', '其他'],
  '娱乐休闲': ['电影演出', '游戏充值', '运动健身', '旅游度假', 'KTV酒吧', '其他'],
  '医疗健康': ['看病买药', '体检', '牙科', '保健品', '其他'],
  '教育学习': ['学费培训', '考试报名', '教材书籍', '文具用品', '其他'],
  '人情往来': ['请客送礼', '红包礼金', '孝敬长辈', '慈善捐款', '其他'],
  '金融保险': ['保险', '银行手续费', '利息还款', '其他'],
  '其他支出': ['其他支出']
};

const cat1 = document.getElementById('cat1');
const cat2 = document.getElementById('cat2');
const dateInput = document.getElementById('date');
const saveBtn = document.getElementById('save');
const toast = document.getElementById('toast');

// 填入一级分类
for (const name of Object.keys(CATEGORIES)) {
  const opt = document.createElement('option');
  opt.textContent = name;
  cat1.appendChild(opt);
}

// 一级分类变化时联动二级分类
function fillCat2() {
  cat2.innerHTML = '';
  for (const sub of CATEGORIES[cat1.value]) {
    const opt = document.createElement('option');
    opt.textContent = sub;
    cat2.appendChild(opt);
  }
}
cat1.addEventListener('change', fillCat2);
fillCat2();

// 日期默认今天
const today = new Date();
const y = today.getFullYear();
const m = String(today.getMonth() + 1).padStart(2, '0');
const d = String(today.getDate()).padStart(2, '0');
dateInput.value = `${y}-${m}-${d}`;

// 保存按钮（骨架版：仅提示）
saveBtn.addEventListener('click', () => {
  toast.textContent = '保存功能将在下一阶段接入，敬请期待';
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2000);
});
