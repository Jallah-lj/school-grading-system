export const emailTemplates = {
  gradesPublished: (studentName: string, subjectName: string, className: string, link: string): { subject: string; html: string; text: string } => {
    const subject = `Grades published: ${subjectName} — ${className}`;
    const text = `Hello ${studentName},\n\nYour grades for ${subjectName} (${className}) have been published.\n\nView your results: ${link}\n\n— School Grading System`;
    const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Grades Published</title></head>
<body style="font-family:system-ui,sans-serif;color:#1e293b;background:#f8fafc;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;padding:32px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
    <h2 style="margin-top:0;color:#312e81;font-size:20px;">Grades Published</h2>
    <p>Hi <strong>${studentName}</strong>,</p>
    <p>Your grades for <strong>${subjectName}</strong> (${className}) have been published.</p>
    <p><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View My Grades</a></p>
    <p style="font-size:13px;color:#64748b;margin-top:24px;">— School Grading System</p>
  </div>
</body>
</html>`;
    return { subject, html, text };
  },

  reportCardReady: (studentName: string, semesterName: string, link: string): { subject: string; html: string; text: string } => {
    const subject = `Your report card is ready — ${semesterName}`;
    const text = `Hello ${studentName},\n\nYour report card for ${semesterName} is now available.\n\nOpen it here: ${link}\n\n— School Grading System`;
    const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Report Card Ready</title></head>
<body style="font-family:system-ui,sans-serif;color:#1e293b;background:#f8fafc;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;padding:32px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
    <h2 style="margin-top:0;color:#312e81;font-size:20px;">Report Card Ready</h2>
    <p>Hi <strong>${studentName}</strong>,</p>
    <p>Your report card for <strong>${semesterName}</strong> is now available.</p>
    <p><a href="${link}" style="display:inline-block;background:#0d9488;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Report Card</a></p>
    <p style="font-size:13px;color:#64748b;margin-top:24px;">— School Grading System</p>
  </div>
</body>
</html>`;
    return { subject, html, text };
  },

  passwordReset: (name: string, resetLink: string): { subject: string; html: string; text: string } => {
    const subject = 'Reset your School Grading System password';
    const text = `Hello ${name},\n\nYou requested a password reset. Click the link below to set a new password:\n\n${resetLink}\n\nThis link expires in 15 minutes. If you didn't request this, ignore this email.\n\n— School Grading System`;
    const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Password Reset</title></head>
<body style="font-family:system-ui,sans-serif;color:#1e293b;background:#f8fafc;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;padding:32px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
    <h2 style="margin-top:0;color:#312e81;font-size:20px;">Password Reset</h2>
    <p>Hi <strong>${name}</strong>,</p>
    <p>You requested a password reset. Click the button below to set a new password.</p>
    <p><a href="${resetLink}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a></p>
    <p style="font-size:13px;color:#64748b;margin-top:24px;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
    <p style="font-size:13px;color:#64748b;">— School Grading System</p>
  </div>
</body>
</html>`;
    return { subject, html, text };
  },

  announcementBroadcast: (title: string, message: string, link?: string): { subject: string; html: string; text: string } => {
    const subject = `School Announcement: ${title}`;
    const text = `${message}\n\n${link ? `More info: ${link}` : ''}\n\n— School Grading System`;
    const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Announcement</title></head>
<body style="font-family:system-ui,sans-serif;color:#1e293b;background:#f8fafc;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;padding:32px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
    <h2 style="margin-top:0;color:#312e81;font-size:20px;">School Announcement</h2>
    <h3 style="color:#475569;margin-top:0;font-size:16px;">${title}</h3>
    <p>${message.replace(/\n/g, '<br>')}</p>
    ${link ? `<p><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Read More</a></p>` : ''}
    <p style="font-size:13px;color:#64748b;margin-top:24px;">— School Grading System</p>
  </div>
</body>
</html>`;
    return { subject, html, text };
  },
};
