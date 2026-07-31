const ExcelJS = require('exceljs');
const fs = require('fs');

(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.addRow(['name', 'email', 'password', 'dateOfBirth', 'gender', 'class', 'stream', 'parentEmail', 'guardianPhone', 'address']);
  const t = Date.now();
  ws.addRow(['Bosco Umutoni', `bosco.${t}@school.rw`, 'Bosco@123', '2012-01-15', 'MALE', 'Senior 1', 'A', '', '+250788111111', 'Kigali']);           // ok, explicit pw
  ws.addRow(['Claudine Mukamana', `claudine.${t}@school.rw`, '', '2012-06-20', 'FEMALE', 'Senior 2', 'A', '', '', 'Huye']);                        // ok, auto pw
  ws.addRow(['Duplicate Infile', `bosco.${t}@school.rw`, '', '2012-01-01', 'MALE', '', '', '', '', '']);                                          // fail: dup in file
  ws.addRow(['Bad Email', 'not-an-email', '', '2012-01-01', 'MALE', '', '', '', '', '']);                                                          // fail: email
  ws.addRow(['Bad Class', `badclass.${t}@school.rw`, '', '2012-01-01', 'FEMALE', 'Nursery 9', 'Z', '', '', '']);                                   // fail: class
  ws.addRow(['Bad Gender', `badgender.${t}@school.rw`, '', '2012-01-01', 'X', '', '', '', '', '']);                                                // fail: gender
  ws.addRow(['Divine Irakoze', `divine.${t}@school.rw`, '', '2011-11-05', 'FEMALE', 'Senior 1', 'A', 'parent@school.rw', '', 'Kigali']);           // ok, w/ parent
  ws.addRow(['Existing Email', 'student@school.rw', '', '2012-01-01', 'MALE', '', '', '', '', '']);                                                // fail: already registered
  const buf = await wb.xlsx.writeBuffer();
  fs.writeFileSync('/tmp/import-test.xlsx', Buffer.from(buf));

  // CSV with aliased headers + quoted field + one oversized-batch file
  const csv = [
    'Full Name,Email Address,DOB,Sex,Class Name,Section,Guardian Phone',
    `Eric Nshimiyimana,eric.${t}@school.rw,2013-03-09,MALE,Senior 1,A,+250788222222`,
  ].join('\n');
  fs.writeFileSync('/tmp/import-aliases.csv', csv);

  const big = ['name,email,dateOfBirth,gender'];
  for (let i = 1; i <= 501; i++) big.push(`Bulk Person ${i},bulk${i}.${t}@school.rw,2012-01-01,MALE`);
  fs.writeFileSync('/tmp/import-big.csv', big.join('\n'));
  fs.writeFileSync('/tmp/import-wrong.txt', 'name,email\nX,x@x.rw');
  console.log('files ready, t =', t);
})();
