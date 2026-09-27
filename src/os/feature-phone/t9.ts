/**
 * T9 拼音输入引擎：
 *   按键序列 → 音节切分 → 候选词/字
 * 三种模式：拼音（T9）/ 英文（多击）/ 数字。
 * 字典为常用字子集，够发短信即可。
 */
export type ImeMode = 'py' | 'en' | 'num'

const KEY_LETTERS: Record<string, string> = {
  '2': 'abc',
  '3': 'def',
  '4': 'ghi',
  '5': 'jkl',
  '6': 'mno',
  '7': 'pqrs',
  '8': 'tuv',
  '9': 'wxyz',
}

const PUNCT_PY = '，。？！…'
const PUNCT_EN = '.,?!@_'

/** 拼音 → 常用汉字（按频率粗排），键的并集即有效音节表 */
export const DICT: Record<string, string> = {
  a: '啊阿',
  ai: '爱哎矮',
  an: '安按暗岸',
  ang: '昂',
  ao: '奥袄熬',
  ba: '吧爸把八拔',
  bai: '白白百拜',
  ban: '半办搬板班',
  bang: '帮棒绑膀',
  bao: '抱包宝报饱薄',
  bei: '被北倍背杯贝',
  ben: '本笨奔',
  beng: '蹦崩',
  bi: '比笔必须鼻',
  bian: '边变便遍辩',
  biao: '表彪',
  bie: '别憋',
  bin: '宾滨',
  bing: '病并冰饼',
  bo: '波播伯薄玻拨',
  bu: '不步部补布',
  ca: '擦',
  cai: '才菜猜采彩',
  can: '参残餐',
  cao: '草操糙',
  ce: '测侧策册',
  ceng: '层蹭',
  cha: '差茶查察插',
  chai: '拆柴',
  chan: '产颤馋',
  chang: '长常场唱厂尝',
  chao: '超朝吵抄潮',
  che: '车彻撤',
  chen: '陈沉晨衬尘',
  cheng: '成城程称诚承',
  chi: '吃迟池持齿尺',
  chong: '冲重充虫崇',
  chou: '抽愁丑筹稠',
  chu: '出处除初楚础',
  chuan: '传船穿串',
  chuang: '窗床闯创',
  chui: '吹垂锤',
  chun: '春纯唇蠢',
  ci: '次此词辞慈',
  cong: '从聪匆丛',
  cu: '醋促粗簇',
  cuan: '窜蹿',
  cui: '催脆翠',
  cun: '村存寸',
  cuo: '错措搓挫',
  da: '大打答达搭',
  dai: '带待代戴呆贷',
  dan: '但单蛋淡担胆',
  dang: '当党挡档',
  dao: '到道倒刀岛盗导',
  de: '的得德',
  deng: '等灯登凳',
  di: '低的底弟地第滴帝递',
  dian: '点店电垫甸颠典',
  diao: '掉调吊钓雕',
  die: '跌爹叠碟',
  ding: '定订顶钉盯',
  dong: '动东冬懂董洞冻',
  dou: '都斗豆抖逗痘',
  du: '读度独堵赌肚杜渡',
  duan: '段断短端缎',
  dui: '对队堆兑',
  dun: '顿吨蹲盾',
  duo: '多朵躲舵夺堕',
  e: '饿恶额鹅蛾',
  en: '恩',
  er: '而二儿耳尔',
  fa: '发法罚乏伐',
  fan: '反饭烦犯翻范繁',
  fang: '放方房防访纺',
  fei: '飞非费肥废匪',
  fen: '分份粉奋愤芬',
  feng: '风丰封疯逢缝蜂峰',
  fo: '佛',
  fou: '否缶',
  fu: '服福父付复夫富附府腐妇负',
  gai: '改盖该概丐',
  gan: '感干赶敢甘肝杆',
  gang: '刚钢港岗缸',
  gao: '高告搞糕稿',
  ge: '个哥歌格隔阁各',
  gei: '给',
  gen: '跟根',
  geng: '更耕',
  gong: '工公共功宫供攻',
  gou: '够狗购构沟钩',
  gu: '古顾故鼓骨姑股固',
  gua: '挂瓜刮寡',
  guai: '怪乖拐',
  guan: '关管观官馆惯冠',
  guang: '光逛广',
  gui: '贵鬼归规桂柜',
  guo: '国过果锅裹郭',
  ha: '哈蛤',
  hai: '还海害孩',
  han: '汉喊含寒韩憾',
  hang: '行航夯',
  hao: '好号浩毫豪耗',
  he: '喝和合河贺何荷盒',
  hei: '黑嘿',
  hen: '很恨狠痕',
  heng: '横哼衡',
  hong: '红洪虹宏轰哄',
  hou: '后厚猴吼候',
  hu: '湖呼虎忽护互壶胡糊户',
  hua: '话花华画化划',
  huai: '坏怀槐',
  huan: '换还环缓幻唤患',
  huang: '黄慌荒煌晃谎',
  hui: '会回汇灰辉挥惠毁悔',
  hun: '婚混魂昏荤',
  huo: '活火或货获伙',
  ji: '机级极几记己既即集季寄急继计济技纪基吉',
  jia: '家加假价架驾甲佳',
  jian: '见间件建简尖肩健渐检减剑荐',
  jiang: '讲将江姜降奖酱疆匠',
  jiao: '叫脚交教觉角娇搅骄缴',
  jie: '接姐街借介届结解界杰节戒',
  jin: '进今近金紧仅斤劲尽禁',
  jing: '经静精京景惊净竟敬镜境',
  jiu: '就九久旧酒救舅纠',
  ju: '句局具举巨剧距离拒据聚',
  juan: '卷倦圈绢捐',
  jue: '觉决绝爵嚼',
  jun: '军均君菌',
  ka: '卡咖喀',
  kai: '开凯慨',
  kan: '看砍刊堪侃',
  kang: '抗康慷糠',
  kao: '考靠烤拷',
  ke: '可课科克刻客渴棵颗壳',
  ken: '肯垦恳啃',
  kong: '空恐控孔',
  kou: '口扣寇',
  ku: '苦哭库裤枯酷',
  kua: '跨夸垮挎',
  kuai: '快块筷',
  kuan: '宽款',
  kuang: '筐狂况矿框',
  kui: '亏愧葵魁溃',
  kun: '困捆坤',
  kuo: '阔扩括',
  la: '拉啦辣腊蜡垃',
  lai: '来赖莱',
  lan: '蓝篮兰懒烂栏拦篮',
  lang: '浪狼朗郎廊',
  lao: '老劳捞牢姥络',
  le: '了乐勒叻',
  lei: '累雷类泪蕾垒',
  leng: '冷愣楞',
  li: '里离力立理李礼利历例丽梨璃厉励',
  lian: '连脸联恋练莲帘链怜',
  liang: '两亮量凉良辆粮晾',
  liao: '料聊疗撩廖',
  lie: '列烈裂猎劣',
  lin: '林临邻淋鳞',
  ling: '领零铃灵玲令龄凌陵',
  liu: '六留流刘榴柳溜',
  long: '龙笼聋隆拢垄',
  lou: '楼搂漏陋',
  lu: '路录露鹿炉卢鲁律虑旅绿屡',
  luan: '乱卵',
  lue: '略掠',
  lun: '论轮伦沦',
  luo: '落罗络洛螺萝逻',
  ma: '妈吗马麻码骂抹',
  mai: '买卖迈埋麦',
  man: '慢满瞒漫蛮蔓',
  mang: '忙茫盲莽芒',
  mao: '猫毛冒贸帽矛貌',
  me: '么麽',
  mei: '没美每妹眉媒梅煤霉',
  men: '们门闷',
  mi: '米密秘蜜迷眯',
  mian: '面免棉眠缅勉',
  miao: '秒妙苗描瞄藐',
  mie: '灭蔑',
  min: '民敏悯闽',
  ming: '明名命鸣铭冥',
  mo: '模么摩磨末默墨陌',
  mou: '某谋牟',
  mu: '木目母亩幕慕牧募墓',
  na: '那拿哪娜纳钠',
  nai: '奶乃耐奈',
  nan: '南男难喃',
  nao: '恼闹脑挠',
  ne: '呢讷',
  nei: '内馁',
  nen: '嫩',
  neng: '能',
  ni: '你尼泥逆腻匿',
  nian: '年念粘捻廿',
  niang: '娘酿',
  niao: '鸟尿',
  nie: '捏镍聂孽',
  nin: '您',
  ning: '宁凝拧柠',
  niu: '牛扭纽钮',
  nong: '农浓弄脓',
  nu: '努怒奴',
  nuan: '暖',
  nue: '虐疟',
  nuo: '挪诺懦糯',
  o: '哦噢',
  ou: '欧偶呕鸥藕',
  pa: '怕爬趴扒',
  pai: '派排拍牌徘',
  pan: '盼判盘攀叛',
  pang: '旁胖乓',
  pao: '跑炮泡抛袍刨',
  pei: '陪赔配佩培赔',
  pen: '盆喷',
  peng: '朋碰捧棚蓬鹏膨烹',
  pi: '皮批僻脾疲披屁譬',
  pian: '片篇偏骗便翩',
  piao: '票漂飘瓢',
  pin: '品贫拼频',
  ping: '平评瓶凭萍屏乒坪',
  po: '破婆迫坡泊颇泼',
  pou: '剖',
  pu: '普铺扑仆菩葡朴浦',
  qi: '起七气期器骑其棋奇齐汽旗妻欺启企',
  qia: '恰卡掐',
  qian: '前钱千浅牵签谦迁乾',
  qiang: '强枪墙抢腔腔',
  qiao: '桥悄敲瞧巧窍俏',
  qie: '切且窃怯契',
  qin: '亲琴勤侵芹勤擒',
  qing: '请清青轻情晴庆卿顷',
  qiong: '穷琼',
  qiu: '求球秋丘囚邱',
  qu: '去取趣区曲驱屈趋娶',
  quan: '全权劝圈泉拳痊',
  que: '却确缺雀鹊阙',
  qun: '群裙',
  ran: '然染燃冉',
  rang: '让嚷壤瓤',
  rao: '绕扰饶娆',
  re: '热惹',
  ren: '人任认忍仁韧',
  reng: '扔仍',
  ri: '日',
  rong: '容荣融绒熔冗',
  rou: '肉柔揉',
  ru: '如入乳儒辱',
  ruan: '软',
  rui: '锐瑞蕊',
  run: '润闰',
  ruo: '若弱',
  sa: '撒洒萨卅',
  sai: '赛塞腮',
  san: '三散伞叁',
  sang: '桑嗓丧',
  sao: '扫嫂骚瘙',
  se: '色涩瑟',
  sen: '森',
  sha: '沙杀傻啥纱刹',
  shai: '筛晒',
  shan: '山闪衫善扇珊删膳',
  shang: '上商伤赏尚裳晌',
  shao: '少烧勺稍绍鞘',
  she: '谁社设舍蛇射涉及摄',
  shei: '谁',
  shen: '什深神身甚申慎渗伸',
  sheng: '生声升胜剩牲甥绳圣',
  shi: '是时十事师诗失使市史式示世势试石食士适释逝誓',
  shou: '手收首受瘦寿售授守',
  shu: '书树数属术输熟束叔暑竖鼠署蜀',
  shua: '刷耍',
  shuai: '帅甩率',
  shuan: '栓拴涮',
  shuang: '双爽',
  shui: '水谁睡税',
  shun: '顺瞬舜',
  shuo: '说朔硕烁',
  si: '四思死丝私似司斯肆撕',
  song: '送松宋颂诵',
  sou: '搜艘嗖',
  su: '速素苏诉俗塑宿肃酥',
  suan: '算酸蒜',
  sui: '岁随虽碎遂髓',
  sun: '孙损笋',
  suo: '所锁缩索琐',
  ta: '他她它塔踏塌',
  tai: '太台抬态泰钛',
  tan: '谈贪摊滩坛探叹弹潭毯',
  tang: '糖汤堂躺烫塘膛唐',
  tao: '逃桃讨套陶淘涛萄',
  te: '特忑',
  teng: '疼腾藤',
  ti: '提题体替踢梯啼剃',
  tian: '天田甜添填舔',
  tiao: '条跳挑调迢',
  tie: '铁贴帖',
  ting: '听停庭亭挺厅',
  tong: '同通痛统桶铜童筒',
  tou: '头偷投透',
  tu: '图途土突吐徒兔涂屠',
  tuan: '团湍',
  tui: '推腿退褪颓',
  tun: '吞屯囤',
  tuo: '拖托脱驼驮妥椭',
  wa: '挖蛙娃瓦袜蛙',
  wai: '外歪',
  wan: '完玩晚碗万湾弯腕丸挽',
  wang: '王望往网忘汪亡旺',
  wei: '为位未维围唯伟威微危委桅慰卫',
  wen: '问温文闻稳吻纹蚊',
  weng: '翁嗡',
  wo: '我握窝卧蜗',
  wu: '五无物误屋武午吴雾悟舞伍',
  xi: '西系喜细希席息习洗戏析袭溪锡',
  xia: '下夏虾瞎吓峡侠辖',
  xian: '先现线显险鲜献县限羡仙弦',
  xiang: '想向相香象像响项箱乡享详祥翔',
  xiao: '小笑消效销晓校肖削宵潇',
  xie: '写些谢协鞋械斜泄蟹歇',
  xin: '新心信欣辛薪芯',
  xing: '行星性形姓兴醒幸杏刑型',
  xiong: '兄熊胸凶',
  xiu: '修休羞秀袖锈绣',
  xu: '需须许续序蓄绪嘘',
  xuan: '选悬旋玄宣轩',
  xue: '学雪血靴穴',
  xun: '寻训迅讯巡旬询',
  ya: '呀压牙鸭雅亚轧芽',
  yan: '眼言演烟沿盐颜严宴雁燕岩研延',
  yang: '样阳养羊洋扬仰氧痒杨漾',
  yao: '要药摇遥咬腰邀耀',
  ye: '也夜叶业爷页野液椰',
  yi: '一以已意义易衣医移艺议依益疑仪宜',
  yin: '因音银引饮印隐',
  ying: '应影英迎赢营映硬鹰',
  yo: '哟',
  yong: '用永拥勇涌庸泳',
  you: '有又友由油右邮游优幽悠忧',
  yu: '于与育余雨语预玉鱼遇域欲愈狱誉',
  yuan: '元员院原远愿园源圆缘袁',
  yue: '月约越乐跃岳悦',
  yun: '云运允孕韵晕',
  za: '杂砸咋',
  zai: '在再灾载宰',
  zan: '咱赞暂攒',
  zang: '脏葬',
  zao: '早造遭糟枣灶躁',
  ze: '则责择泽',
  zei: '贼',
  zen: '怎',
  zeng: '增赠',
  zha: '渣扎炸眨诈闸',
  zhai: '摘窄宅债斋',
  zhan: '站占战展沾盏斩栈',
  zhang: '张长章涨帐账障丈',
  zhao: '找着照招朝召兆',
  zhe: '这着折哲遮',
  zhen: '真镇阵枕震珍斟侦诊',
  zheng: '正整争政征挣睁筝',
  zhi: '只知之制直至值指纸支止址治智志质',
  zhong: '中种重众终钟忠肿仲',
  zhou: '周州洲粥轴皱骤昼',
  zhu: '住注主猪竹诸煮著驻祝助',
  zhua: '抓爪',
  zhuai: '拽',
  zhuan: '转专砖赚传',
  zhuang: '装壮状撞桩',
  zhui: '追坠缀',
  zhun: '准',
  zhuo: '桌捉拙灼',
  zi: '子自字紫资姿滋',
  zong: '总纵综宗棕踪',
  zou: '走奏揍租',
  zu: '组足族租阻祖',
  zuan: '钻',
  zui: '最嘴醉罪',
  zun: '尊',
  zuo: '做坐左作座昨',
}

/** 词组（音节串 → 词） */
export const WORDS: Record<string, string> = {
  'ni hao': '你好',
  'xie xie': '谢谢',
  'zai jian': '再见',
  'dui bu qi': '对不起',
  'mei guan xi': '没关系',
  'wo men': '我们',
  'ni men': '你们',
  'ta men': '他们',
  'ma ma': '妈妈',
  'ba ba': '爸爸',
  'ye ye': '爷爷',
  'nai nai': '奶奶',
  'ge ge': '哥哥',
  'jie jie': '姐姐',
  'di di': '弟弟',
  'mei mei': '妹妹',
  'lao shi': '老师',
  'xue sheng': '学生',
  'peng you': '朋友',
  'hai zi': '孩子',
  'shang wang': '上网',
  'shou ji': '手机',
  'dian hua': '电话',
  'duan xin': '短信',
  'dian nao': '电脑',
  'you xi': '游戏',
  'zao shang': '早上',
  'zhong wu': '中午',
  'xia wu': '下午',
  'wan shang': '晚上',
  'jin tian': '今天',
  'ming tian': '明天',
  'zuo tian': '昨天',
  'xian zai': '现在',
  'shi jian': '时间',
  'chi fan': '吃饭',
  'shui jiao': '睡觉',
  'gong zuo': '工作',
  'xue xi': '学习',
  'kai xin': '开心',
  'hao chi': '好吃',
  'hao kan': '好看',
  'bu hao': '不好',
  'hen hao': '很好',
  'hao de': '好的',
  'tai hao le': '太好了',
  'zhu ni': '祝你',
  'sheng ri': '生日',
  'kuai le': '快乐',
  'shen ti': '身体',
  'jian kang': '健康',
  'yi ding': '一定',
  'zhi dao': '知道',
  'ren wei': '认为',
  'yin wei': '因为',
  'suo yi': '所以',
  'dan shi': '但是',
  'er qie': '而且',
  'bu yao': '不要',
  'mei you': '没有',
  'bu xing': '不行',
  'bu cuo': '不错',
  'jia you': '加油',
  'xi huan': '喜欢',
  'qi dai': '期待',
  'wo de': '我的',
  'ni de': '你的',
  'ke yi': '可以',
  'ru guo': '如果',
  'yi jing': '已经',
  'hai shi': '还是',
  'wan shang hao': '晚上好',
  'zao shang hao': '早上好',
  'dui le': '对了',
  'deng deng': '等等',
  'fang xin': '放心',
  'hui jia': '回家',
  'zhou mo': '周末',
  'shen me': '什么',
  'zen me': '怎么',
  'wei shen me': '为什么',
  'zhe yang': '这样',
  'na yang': '那样',
}

/** 数字串 → 候选拼音（模块加载时从 DICT 派生） */
const DIGIT_PY = new Map<string, string[]>()
for (const py of Object.keys(DICT)) {
  const digits = [...py]
    .map((ch) => {
      for (const [d, letters] of Object.entries(KEY_LETTERS))
        if (letters.includes(ch)) return d
      return '?'
    })
    .join('')
  const list = DIGIT_PY.get(digits) ?? []
  list.push(py)
  DIGIT_PY.set(digits, list)
}

/** 常用音节优先级（同数字串多拼音时，常用者优先出候选） */
const HOT = [
  'de', 'yi', 'bu', 'shi', 'wo', 'ni', 'ta', 'ge', 'zhe', 'ji',
  'ren', 'zai', 'you', 'hao', 'dou', 'yao', 'jiu', 'hai', 'neng', 'xiang',
  'dao', 'shuo', 'kan', 'zou', 'chi', 'he', 'zuo', 'lai', 'qu', 'wen',
  'da', 'xiao', 'duo', 'zhong', 'guo', 'jia', 'shang', 'xia', 'li', 'qi',
  'ma', 'ba', 'er', 'san', 'si', 'wu', 'liu', 'mei', 'tian', 'nian',
]

function hotScore(py: string): number {
  const i = HOT.indexOf(py)
  return i === -1 ? HOT.length : i
}

/** 数字串 → 所有可行音节切分（音节数升序，同数量按常用度） */
function segment(digits: string): string[][] {
  const out: string[][] = []
  const dfs = (i: number, acc: string[]) => {
    if (out.length >= 48) return
    if (i === digits.length) {
      out.push([...acc])
      return
    }
    const max = Math.min(6, digits.length - i)
    for (let l = 1; l <= max; l++) {
      const part = digits.slice(i, i + l)
      const pys = DIGIT_PY.get(part)
      if (pys) for (const py of pys) dfs(i + l, [...acc, py])
    }
  }
  dfs(0, [])
  out.sort(
    (a, b) =>
      a.length - b.length ||
      a.reduce((s, p) => s + hotScore(p), 0) - b.reduce((s, p) => s + hotScore(p), 0),
  )
  return out
}

export class T9 {
  mode: ImeMode = 'py'
  /** 拼音状态 */
  digits = ''
  segs: string[] = []
  cands: string[] = []
  candIdx = 0
  /** 英文多击 / 标点轮选状态 */
  private pending = ''
  private pendingKey = ''
  private pendingGroup = ''
  private pendingIdx = 0
  private pendingAt = 0

  setMode(m: ImeMode) {
    this.mode = m
    this.reset()
  }

  cycleMode(): ImeMode {
    this.setMode(this.mode === 'py' ? 'en' : this.mode === 'en' ? 'num' : 'py')
    return this.mode
  }

  reset() {
    this.digits = ''
    this.segs = []
    this.cands = []
    this.candIdx = 0
    this.clearPending()
  }

  /**
   * 按下数字键。返回需要立即上屏的字符（多击提交、标点、数字、空格），
   * 拼音候选不在此返回 —— 用 select() 上屏。
   */
  press(d: string): string | null {
    if (this.mode === 'num') return d
    if (d === '1') return this.multitap('1', this.mode === 'py' ? PUNCT_PY : PUNCT_EN)
    if (d === '0') {
      const out = this.commitPending()
      return out + ' '
    }
    if (this.mode === 'en') {
      const letters = KEY_LETTERS[d]
      return letters ? this.multitap(d, letters) : null
    }
    // 拼音模式：2-9
    if (!/^[2-9]$/.test(d)) return null
    const out = this.commitPending()
    this.digits += d
    this.recompute()
    return out || null
  }

  /** 多击轮选到期提交（编辑器每 100ms 调一次） */
  expire(): string | null {
    if (this.pending && Date.now() - this.pendingAt >= 900) {
      const out = this.commitPending()
      return out || null
    }
    return null
  }

  /** 确认上屏：拼音取当前候选，或提交多击字符 */
  select(): string | null {
    if (this.mode === 'py' && this.digits) {
      const s = this.cands[this.candIdx]
      this.digits = ''
      this.recompute()
      if (s) return this.commitPending() + s
    }
    const out = this.commitPending()
    return out || null
  }

  /** 上/下切换候选 */
  cycleCand(dir: 1 | -1) {
    if (!this.cands.length) return
    this.candIdx = (this.candIdx + dir + this.cands.length) % this.cands.length
  }

  /**
   * 删除：先删未上屏的输入状态，删空后报告 'char'（编辑器继续删正文）。
   */
  backspace(): 'digit' | 'char' {
    if (this.pending) {
      this.clearPending()
      return 'digit'
    }
    if (this.digits) {
      this.digits = this.digits.slice(0, -1)
      this.recompute()
      return 'digit'
    }
    return 'char'
  }

  /** 输入提示：拼音串 / 待定字母 */
  hint(): string {
    if (this.mode === 'en') return this.pending
    if (this.mode === 'num') return ''
    if (this.pending) return this.pending
    return this.segs.length ? this.segs.join(' ') : this.digits
  }

  private multitap(d: string, group: string): string | null {
    const now = Date.now()
    if (d === this.pendingKey && this.pendingGroup === group && now - this.pendingAt < 900) {
      this.pendingIdx = (this.pendingIdx + 1) % group.length
      this.pending = group[this.pendingIdx]
      this.pendingAt = now
      return null
    }
    const out = this.commitPending()
    this.pendingKey = d
    this.pendingGroup = group
    this.pendingIdx = 0
    this.pending = group[0]
    this.pendingAt = now
    return out || null
  }

  private commitPending(): string {
    const out = this.pending
    this.clearPending()
    return out
  }

  private clearPending() {
    this.pending = ''
    this.pendingKey = ''
    this.pendingGroup = ''
    this.pendingIdx = 0
  }

  private recompute() {
    this.candIdx = 0
    this.segs = []
    this.cands = []
    if (!this.digits) return
    const segs = segment(this.digits)
    this.segs = segs[0] ?? []
    const out: string[] = []
    const push = (s: string) => {
      if (s && !out.includes(s) && out.length < 9) out.push(s)
    }
    // 1. 词组优先（扫描全部切分）
    for (const seg of segs) {
      const w = WORDS[seg.join(' ')]
      if (w) push(w)
    }
    // 2. 单音节：合并同一数字串的所有拼音的候选字（按常用度排序）
    if (this.segs.length === 1) {
      const pys = [...(DIGIT_PY.get(this.digits) ?? [])].sort(
        (a, b) => hotScore(a) - hotScore(b),
      )
      for (const py of pys) {
        for (const ch of DICT[py] ?? '') push(ch)
      }
    }
    // 3. 音节组合（首音节字 + 末音节备选字）
    for (const seg of segs.slice(0, 6)) {
      if (seg.length < 2) continue
      push(seg.map((s) => DICT[s]?.[0] ?? '').join(''))
      const alts = DICT[seg[seg.length - 1]] ?? ''
      for (let k = 1; k <= 2 && k < alts.length; k++) {
        push(seg.map((s, i) => (i === seg.length - 1 ? alts[k] : DICT[s]?.[0] ?? '')).join(''))
      }
    }
    this.cands = out
  }
}
