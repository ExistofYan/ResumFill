/* Pure field matching, shared by extension and offline tests. */
(function(root){
  const aliases={
    email:['email','emailaddress','邮箱','电子邮箱','电子邮件'],
    phone:['phone','phonenumber','mobile','mobilenumber','telephone','contactnumber','手机','手机号','手机号码','联系电话','电话号码'],
    first_name:['firstname','givenname','英文名'],last_name:['lastname','familyname','surname','英文姓'],
    name:['fullname','candidatename','applicantname','yourname','姓名','中文姓名','真实姓名','name'],
    city:['currentcity','city','location','现居城市','现居地','所在城市','居住城市'],
    address:['streetaddress','addressline1','address','详细地址','联系地址','通讯地址'],
    postcode:['postalcode','postcode','zipcode','邮编','邮政编码'],
    github:['github','githuburl','github链接'],linkedin:['linkedin','linkedinurl'],
    website:['website','portfolio','personalwebsite','个人网站','作品集链接','个人主页'],
    job_title:['desiredposition','desiredjobtitle','targetrole','positionappliedfor','意向职位','求职意向','应聘职位','申请职位'],
    availability:['availability','availablefrom','startavailability','到岗时间','最早到岗时间'],
    school:['university','school','schoolname','institution','institutionname','毕业院校','毕业学校','学校名称','学校','院校'],
    degree:['degree','highestdegree','educationlevel','qualification','学历','最高学历','学位'],
    major:['major','fieldofstudy','discipline','专业','所学专业','专业名称'],
    graduation:['graduation','graduationdate','graduationyear','毕业时间','毕业日期','毕业年份'],
    company:['company','companyname','employer','employername','公司','公司名称','工作单位'],
    position:['jobtitle','positiontitle','position','任职职位','岗位名称','担任职位'],
    work_description:['jobdescription','responsibilities','workdescription','工作职责','工作描述','职责描述'],
    summary:['summary','professionalsummary','personalstatement','aboutme','自我评价','个人简介','自我介绍'],
    skills:['skills','technicalskills','技能','专业技能','技术栈','技能描述'],
    education_text:['educationhistory','educationexperience','教育经历','教育背景'],
    experience_text:['workexperience','employmenthistory','experience','工作经历','实习经历'],
    projects:['projects','projectexperience','项目经历','项目经验'],
    cover_letter:['coverletter','求职信','申请信']
  };
  const auto={name:'name','given-name':'first_name','family-name':'last_name',email:'email',tel:'phone','tel-national':'phone','street-address':'address','address-line1':'address','address-level2':'city','postal-code':'postcode',url:'website','organization':'company','organization-title':'position'};
  const normalize=s=>String(s||'').toLowerCase().replace(/[\s_\-:：*()（）/\.]+/g,'').replace(/(必填|选填|required|optional)/g,'');
  function matchField(descriptors,autocomplete=''){
    const all=descriptors.join(' ').toLowerCase();
    if(/password|captcha|verification|验证码|密码|身份证|护照|passport|national.?id|birth|出生|salary|薪资|search|搜索|紧急联系人|emergency|推荐人|referee|reference.?name/.test(all))return null;
    const exact=new Set();
    for(const raw of descriptors){const d=normalize(raw);for(const [key,words]of Object.entries(aliases))if(words.includes(d))exact.add(key);}
    if(exact.size>1)return null;
    if(exact.size===1)return [...exact][0];
    let best=null,score=0,tie=false;
    for(const raw of descriptors){
      const d=normalize(raw);if(!d||d.length>160)continue;
      for(const [key,words] of Object.entries(aliases))for(const a of words){
        // Short English fragments must match exactly (name must not match username).
        const s=d===a?100+a.length:(a.length>=5&&d.includes(a)?40+a.length:0);
        if(s>score){score=s;best=key;tie=false;}else if(s&&s===score&&best!==key)tie=true;
      }
    }
    if(best&&!tie)return best;
    return auto[autocomplete.trim().split(/\s+/).pop()]||null;
  }
  function flatten(profile){
    const out={...profile.fields};
    (profile.custom||[]).forEach((x,i)=>{out['custom:'+i]=x.value;});return out;
  }
  const api={matchField,normalize,flatten,aliases};root.ResumeFillEngine=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
