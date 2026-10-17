const assert=require('node:assert/strict');
const {matchField,flatten}=require('../extension/engine.js');
const cases=[
  [['姓名'],'name'],[['full_name'],'name'],[['company_name'],'company'],[['first_name'],'first_name'],
  [['毕业院校'],'school'],[['现居城市'],'city'],[['电子邮箱'],'email'],[['手机号码'],'phone'],
  [['意向职位'],'job_title'],[['job_title'],'position'],[['专业技能'],'skills'],
  [['验证码'],'verification-code',null],[['password'],null],[['护照号码'],null],
  [['search'],null],[['mystery_829'],null],[['username'],null],[['reference_name'],null],
  [['工作职责'],'work_description'],[['学历'],'degree'],[['education_history'],'education_text']
];
for(const row of cases){const expected=row.length===3?row[2]:row[1];assert.equal(matchField(row[0]),expected,JSON.stringify(row[0]));}
assert.equal(matchField([], 'section-user given-name'),'first_name');
assert.equal(matchField(['密码'],'name'),null);
assert.equal(matchField(['姓名','email']),null);
assert.equal(matchField(['专业','school']),null);
assert.equal(matchField(['name','first_name']),null);
assert.deepEqual(flatten({fields:{name:'Yan'},custom:[{label:'second',value:'Company B'}]}),{name:'Yan','custom:0':'Company B'});
console.log(`PASS: ${cases.length+6} field matching and profile cases`);
