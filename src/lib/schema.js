/**
 * schema.js —— 全局共享的「资料字段定义 + 存储读写」
 * 被 content script / popup / options 三处复用，保证字段与匹配规则只有一份。
 */
(function () {
  const RH = (window.RH = window.RH || {});
  RH.version = '1.0.0';

  /* ------------------------------------------------------------------ *
   * 字段定义
   *   key       存储用的扁平键名
   *   type      text | textarea | date | month | select
   *   strong    强关键词：命中即高度可信（属性 12 分 / 标签 10 分 / 邻近 4 分）
   *   weak      弱关键词：辅助判断（属性 6 分 / 标签 5 分）
   *   negative  反向关键词：命中直接 -30 分，用来排除「公司名称」「验证码」这类干扰项
   * ------------------------------------------------------------------ */
  RH.SECTIONS = [
    {
      id: 'basic',
      title: '基本信息',
      desc: '网申第一步，几乎每家公司都会问',
      fields: [
        {
          key: 'name', label: '姓名', type: 'text', ph: '张三', required: true,
          strong: ['姓名', '真实姓名', '中文姓名', 'name', 'fullname', 'realname'],
          weak: ['名字', '申请人'],
          negative: ['公司', '单位', '学校', '院校', '项目', '文件', '用户名', '昵称', '登录', '账号',
            '联系人', '推荐人', '导师', '父亲', '母亲', '家长', '紧急', '英文名', '拼音',
            'company', 'school', 'project', 'file', 'username', 'nickname', 'login', 'account',
            'contact', 'emergency', 'father', 'mother', 'parent']
        },
        {
          key: 'gender', label: '性别', type: 'select', options: ['男', '女'], required: true,
          strong: ['性别', 'gender', 'sex'], weak: [], negative: []
        },
        {
          key: 'birthday', label: '出生日期', type: 'date', ph: '2003-05-18',
          strong: ['出生日期', '出生年月日', '出生年月', '生日', 'birthday', 'birthdate', 'dateofbirth', 'dob'],
          weak: ['出生'], negative: ['入学', '毕业', '工作']
        },
        {
          key: 'nation', label: '民族', type: 'select', options: ['汉族', '回族', '满族', '蒙古族', '壮族', '其他'],
          strong: ['民族', 'ethnicity', 'ethnic'], weak: [], negative: ['国籍', 'nationality']
        },
        {
          key: 'political', label: '政治面貌', type: 'select',
          options: ['中共党员', '中共预备党员', '共青团员', '群众', '其他'],
          strong: ['政治面貌', '党派', 'politicalstatus', 'political'], weak: ['党员'], negative: []
        },
        {
          key: 'marital', label: '婚姻状况', type: 'select', options: ['未婚', '已婚'],
          strong: ['婚姻状况', '婚姻', '婚否', 'marital', 'marriage'], weak: [], negative: []
        },
        {
          key: 'idCard', label: '身份证号', type: 'text', ph: '4401**********1234',
          strong: ['身份证号', '身份证号码', '身份证', '证件号码', '证件号', 'idcard', 'idnumber', 'identitycard'],
          weak: ['证件'], negative: ['学号', '工号', '护照', '学生证', '学籍号', '证件类型', 'studentid', 'passport']
        },
        {
          key: 'phone', label: '手机号', type: 'text', ph: '13800138000', required: true,
          strong: ['手机号码', '手机号', '手机', '联系电话', '联系方式', '电话', 'mobile', 'phone', 'telephone', 'cellphone'],
          weak: ['联系'],
          negative: ['验证码', '区号', '紧急', '家长', '父亲', '母亲', '宿舍', '办公', '固定电话', '传真',
            'code', 'verify', 'captcha', 'emergency', 'sms']
        },
        {
          key: 'email', label: '邮箱', type: 'text', ph: 'you@example.com', required: true,
          strong: ['电子邮箱', '邮箱地址', '邮箱', '邮件地址', '邮件', 'email', 'e-mail', 'mail'],
          weak: [], negative: ['验证码', '邮编', '邮政编码', 'postal', 'zip', 'code', 'verify']
        },
        {
          key: 'wechat', label: '微信号', type: 'text', ph: 'wechat_id',
          strong: ['微信号', '微信', 'wechat', 'weixin'], weak: [], negative: ['公众号', '微信群']
        },
        {
          key: 'qq', label: 'QQ', type: 'text', ph: '123456789',
          strong: ['qq号', 'qq', 'qq号码'], weak: [], negative: ['邮箱', 'email']
        }
      ]
    },
    {
      id: 'location',
      title: '籍贯与地址',
      desc: '有省/市下拉框的网站会自动尝试联动选择',
      fields: [
        {
          key: 'hometown', label: '籍贯', type: 'text', ph: '广东 深圳',
          strong: ['籍贯', '祖籍', 'nativeplace', 'hometown'], weak: [], negative: ['现居', '现住', '通讯']
        },
        {
          key: 'province', label: '省份', type: 'select',
          options: ['北京市', '上海市', '天津市', '重庆市', '广东省', '江苏省', '浙江省', '山东省', '河南省', '四川省', '湖北省', '湖南省', '福建省', '安徽省', '陕西省', '辽宁省', '其他'],
          strong: ['省份', '所在省', '省', 'province'], weak: [], negative: []
        },
        {
          key: 'city', label: '城市', type: 'text', ph: '深圳市',
          strong: ['城市', '所在市', '市', 'city'], weak: [], negative: ['省市', '籍贯']
        },
        {
          key: 'address', label: '详细地址', type: 'text', ph: '南山区科技园 1 号',
          strong: ['详细地址', '通讯地址', '联系地址', '现居住地址', '现住址', '家庭住址', '居住地址', '所在地址', '地址', 'address', 'streetaddress'],
          weak: ['居住'], negative: ['邮箱', 'email', '网址', 'website', 'ip', '籍贯', '户口']
        }
      ]
    },
    {
      id: 'edu',
      title: '教育背景',
      desc: '学历、学校、专业、毕业时间是最容易被筛简历的字段',
      fields: [
        {
          key: 'school', label: '学校', type: 'text', ph: '深圳大学', required: true,
          strong: ['毕业院校', '毕业学校', '学校名称', '院校名称', '就读学校', '学校', '院校', 'school', 'university'],
          weak: ['毕业'], negative: ['公司', '单位', '专业', '学院', '高中', '中学', '初中', '小学',
            'employer', 'company', 'highschool']
        },
        {
          key: 'college', label: '学院', type: 'text', ph: '计算机与软件学院',
          strong: ['所在院系', '院系', '学院', '系别', 'faculty', 'department'],
          weak: [], negative: ['学校', '院校', '大学']
        },
        {
          key: 'major', label: '专业', type: 'text', ph: '软件工程', required: true,
          strong: ['专业名称', '所学专业', '专业', 'major', 'specialty'],
          weak: ['方向'], negative: ['排名', '成绩', '技能', '证书', '课程']
        },
        {
          key: 'eduLevel', label: '学历', type: 'select', options: ['大专', '本科', '硕士', '博士', '其他'], required: true,
          strong: ['最高学历', '学历', '培养层次', 'education', 'edulevel', 'degreelevel'],
          weak: [], negative: ['学位', '学信网', '学历认证']
        },
        {
          key: 'degree', label: '学位', type: 'select', options: ['学士', '硕士', '博士', '无'],
          strong: ['学位', 'degree'], weak: [], negative: ['学历']
        },
        {
          key: 'studyMode', label: '学习形式', type: 'select', options: ['全日制', '非全日制'],
          strong: ['学习形式', '培养方式', '学制类型', 'studymode'], weak: ['全日制'], negative: []
        },
        {
          key: 'enrollDate', label: '入学时间', type: 'month', ph: '2022-09',
          strong: ['入学时间', '入学年月', '入学日期', 'enrollment'], weak: ['入学'], negative: ['毕业', '离职', '实习', '项目']
        },
        {
          key: 'gradDate', label: '毕业时间', type: 'month', ph: '2026-06', required: true,
          strong: ['毕业时间', '毕业年月', '毕业日期', '预计毕业', 'graduation', 'graduatedate'],
          weak: ['毕业'], negative: ['入学']
        },
        {
          key: 'gpa', label: 'GPA / 平均分', type: 'text', ph: '3.6 / 88',
          strong: ['gpa', '绩点', '平均绩点', '平均分', '加权平均分', '成绩'],
          weak: [], negative: ['排名', '成绩单', '英语', '四级', '六级']
        },
        {
          key: 'rank', label: '专业排名', type: 'text', ph: '5/120',
          strong: ['专业排名', '年级排名', '班级排名', '排名', 'rank'], weak: [], negative: []
        },
        {
          key: 'englishLevel', label: '英语水平', type: 'select',
          options: ['CET-4', 'CET-6', '雅思', '托福', '专业四级', '专业八级', '无'],
          strong: ['英语水平', '外语水平', '英语等级', '外语等级', 'cet', '四级', '六级', '雅思', '托福', 'englishlevel'],
          weak: [], negative: ['成绩', '分数', '证书编号']
        },
        {
          key: 'englishScore', label: '英语分数', type: 'text', ph: '535',
          strong: ['英语成绩', '四级成绩', '六级成绩', '英语分数', 'cet成绩', 'cetscore', 'englishscore'],
          weak: ['分数', 'score'], negative: ['排名', 'gpa', '证书编号']
        },
        {
          key: 'computerLevel', label: '计算机水平', type: 'text', ph: '国家二级 / 熟练 Office',
          strong: ['计算机水平', '计算机等级', '计算机能力', 'computerlevel'], weak: ['office'], negative: []
        }
      ]
    },
    {
      id: 'job',
      title: '求职意向',
      desc: '投不同岗位时记得回来改一下',
      fields: [
        {
          key: 'intention', label: '期望岗位', type: 'text', ph: '后端开发工程师', required: true,
          strong: ['期望岗位', '意向岗位', '应聘岗位', '申请职位', '求职意向', '意向职位', '目标岗位', 'appliedposition', 'jobtitle'],
          weak: ['岗位', '职位'], negative: ['公司', '学校', '项目']
        },
        {
          key: 'expectedCity', label: '期望城市', type: 'text', ph: '深圳 / 广州',
          strong: ['期望城市', '意向城市', '期望工作地点', '意向工作地点', '期望工作城市', '工作地点', '期望地点',
            'preferredcity', 'expectedcity', 'expectcity', 'desirecity', 'jobcity', 'worklocation'],
          weak: [], negative: ['现居', '籍贯', '公司']
        },
        {
          key: 'expectedSalary', label: '期望薪资', type: 'text', ph: '面议 / 15-20K',
          strong: ['期望薪资', '期望薪水', '薪资要求', '薪酬期望', '期望月薪', 'salary', 'expectedsalary'],
          weak: ['薪资'], negative: []
        },
        {
          key: 'availableDate', label: '到岗时间', type: 'text', ph: '2026-07 / 随时到岗',
          strong: ['到岗时间', '最快到岗', '可到岗', '入职时间', 'available'], weak: ['到岗'], negative: ['离职']
        },
        {
          key: 'jobSource', label: '信息来源', type: 'text', ph: '校园宣讲会 / 牛客',
          strong: ['招聘信息来源', '信息来源', '获知渠道', '了解渠道', 'source'], weak: ['渠道'], negative: ['邮箱']
        },
        {
          key: 'acceptAdjust', label: '是否服从调剂', type: 'select', options: ['是', '否'],
          strong: ['服从调剂', '接受调剂', '是否服从', '调剂'], weak: [], negative: []
        }
      ]
    },
    {
      id: 'exp',
      title: '实习 / 工作经历',
      desc: '填最主要的一段；长文本框会自动拼成一段完整描述',
      fields: [
        {
          key: 'expCompany', label: '公司 / 单位', type: 'text', ph: '腾讯科技',
          strong: ['公司名称', '单位名称', '实习单位', '工作单位', '公司', '单位', 'employer', 'company'],
          weak: ['实习'], negative: ['学校', '院校', '项目', '推荐', '紧急']
        },
        {
          key: 'expPosition', label: '职位', type: 'text', ph: '后端开发实习生',
          strong: ['职位名称', '担任职位', '职务', '岗位名称', '实习岗位', 'position', 'jobtitle'],
          weak: ['职位'], negative: ['期望', '意向', '应聘', '申请', '公司']
        },
        {
          key: 'expStart', label: '开始时间', type: 'month', ph: '2025-07',
          strong: ['实习开始时间', '开始时间', '起始时间', 'startdate'], weak: ['开始'], negative: ['项目', '入学', '毕业']
        },
        {
          key: 'expEnd', label: '结束时间', type: 'month', ph: '2025-10',
          strong: ['实习结束时间', '结束时间', '离职时间', 'enddate'], weak: ['结束'], negative: ['项目', '入学', '毕业']
        },
        {
          key: 'expDesc', label: '工作内容', type: 'textarea', ph: '负责……，使用……，产出……',
          strong: ['工作内容', '实习内容', '工作描述', '实习描述', '职责描述', '主要职责', '工作职责', 'description'],
          weak: ['职责'], negative: ['项目']
        }
      ]
    },
    {
      id: 'proj',
      title: '项目经历',
      desc: '技术岗最看重的一块，建议写清「做了什么 + 结果」',
      fields: [
        {
          key: 'projName', label: '项目名称', type: 'text', ph: '校园二手交易平台',
          strong: ['项目名称', 'projectname'], weak: ['项目'], negative: ['公司', '学校']
        },
        {
          key: 'projRole', label: '担任角色', type: 'text', ph: '后端负责人',
          strong: ['项目角色', '担任角色', '项目职责', 'role'], weak: [], negative: []
        },
        {
          key: 'projStart', label: '开始时间', type: 'month', ph: '2025-03',
          strong: ['项目开始时间'], weak: ['开始'], negative: ['实习', '工作', '入学']
        },
        {
          key: 'projEnd', label: '结束时间', type: 'month', ph: '2025-06',
          strong: ['项目结束时间'], weak: ['结束'], negative: ['实习', '工作', '入学']
        },
        {
          key: 'projDesc', label: '项目描述', type: 'textarea', ph: '项目背景 / 我的工作 / 成果数据',
          strong: ['项目描述', '项目内容', '项目职责', 'projectdescription'], weak: ['项目'], negative: []
        }
      ]
    },
    {
      id: 'extra',
      title: '其他信息',
      desc: '开放题和长文本，通常决定 HR 的第一印象',
      fields: [
        {
          key: 'campus', label: '校园经历', type: 'textarea', ph: '社团 / 学生工作 / 志愿服务',
          strong: ['校园经历', '社团经历', '学生工作', '社会实践', '校园活动'], weak: [], negative: []
        },
        {
          key: 'awards', label: '获奖情况', type: 'textarea', ph: '2024 国家励志奖学金；2024 蓝桥杯省一',
          strong: ['获奖情况', '获奖经历', '奖项', '荣誉', '奖学金', 'awards', 'honors'], weak: ['获奖'], negative: []
        },
        {
          key: 'skills', label: '技能特长', type: 'textarea', ph: 'Java / Go / MySQL / Docker',
          strong: ['技能特长', '专业技能', '技能', '特长', 'skills'], weak: [], negative: ['计算机']
        },
        {
          key: 'selfEval', label: '自我评价', type: 'textarea', ph: '三句话讲清优势，别写空话',
          strong: ['自我评价', '自我介绍', '个人评价', '个人简介', '个人优势', 'selfevaluation', 'selfintroduction', 'aboutme'],
          weak: ['评价'], negative: []
        },
        {
          key: 'portfolio', label: '作品集 / 主页', type: 'text', ph: 'github.com/yourname',
          strong: ['作品集', '个人主页', 'github', '博客', 'portfolio', 'website', '个人网站'], weak: [], negative: []
        },
        {
          key: 'emergencyName', label: '紧急联系人', type: 'text', ph: '张三（父亲）',
          strong: ['紧急联系人姓名', '紧急联系人', 'emergencycontact'], weak: [], negative: []
        },
        {
          key: 'emergencyPhone', label: '紧急联系人电话', type: 'text', ph: '13900139000',
          strong: ['紧急联系电话', '紧急联系人电话', '紧急联系人手机', 'emergencyphone'], weak: [], negative: []
        }
      ]
    }
  ];

  /* ---------------- 派生工具 ---------------- */

  RH.allFields = function () {
    const out = [];
    RH.SECTIONS.forEach((s) => s.fields.forEach((f) => out.push(Object.assign({ section: s.id }, f))));
    return out;
  };

  RH.fieldMap = function () {
    const map = {};
    RH.allFields().forEach((f) => (map[f.key] = f));
    return map;
  };

  RH.defaults = function () {
    const p = {};
    RH.allFields().forEach((f) => (p[f.key] = ''));
    p.custom = [];
    return p;
  };

  /** 读取资料（含默认值兜底） */
  RH.getProfile = async function () {
    try {
      const { profile } = await chrome.storage.local.get('profile');
      return Object.assign(RH.defaults(), profile || {});
    } catch (e) {
      return RH.defaults();
    }
  };

  RH.saveProfile = async function (profile) {
    await chrome.storage.local.set({ profile });
    return profile;
  };

  /** 资料完整度：只统计标记为 required 的字段 + 姓名手机邮箱 */
  RH.completeness = function (profile) {
    const fields = RH.allFields().filter((f) => f.required);
    if (!fields.length) return 0;
    const done = fields.filter((f) => String(profile[f.key] || '').trim()).length;
    return Math.round((done / fields.length) * 100);
  };

  /** 把「实习经历」几个字段拼成一段可直接粘贴的文本 */
  RH.expText = function (p) {
    const head = [p.expCompany, p.expPosition].filter(Boolean).join(' · ');
    const time = [p.expStart, p.expEnd].filter(Boolean).join(' ~ ');
    return [head, time, p.expDesc].filter(Boolean).join('\n');
  };

  RH.projText = function (p) {
    const head = [p.projName, p.projRole].filter(Boolean).join(' · ');
    const time = [p.projStart, p.projEnd].filter(Boolean).join(' ~ ');
    return [head, time, p.projDesc].filter(Boolean).join('\n');
  };

  /** 资料导出成纯文本，用于完全没法自动填充的网站 */
  RH.toPlainText = function (p) {
    const lines = [];
    RH.SECTIONS.forEach((s) => {
      const rows = [];
      s.fields.forEach((f) => {
        const v = String(p[f.key] || '').trim();
        if (v) rows.push(f.label + '：' + v);
      });
      if (rows.length) {
        lines.push('【' + s.title + '】');
        lines.push(...rows);
        lines.push('');
      }
    });
    (p.custom || []).forEach((c) => {
      if (c && c.label && c.value) lines.push(c.label + '：' + c.value);
    });
    return lines.join('\n').trim();
  };
})();
