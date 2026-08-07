/**
 * Plain, institutional email layout: a pine header band with a thin gold rule,
 * white body, and a simple text link. No marketing styling.
 */
const shell = (title: string, body: string, footerNote?: string) => `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#1c1917;background:#f5f5f4;padding:24px;margin:0;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;">
    <div style="background:#20382e;color:#ffffff;padding:14px 24px;font-size:15px;font-weight:700;">School Grading System</div>
    <div style="height:3px;background:#b8933d;"></div>
    <div style="padding:24px;">
      ${body}
    </div>
    <div style="padding:0 24px 24px;">
      <p style="font-size:12px;color:#78716c;margin:0;">${footerNote ?? '— School Grading System'}</p>
    </div>
  </div>
</body>
</html>`;

const button = (href: string, label: string) =>
  `<p><a href="${href}" style="display:inline-block;background:#2d5442;color:#ffffff;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;">${label}</a></p>`;

export const emailTemplates = {
  gradesPublished: (studentName: string, subjectName: string, className: string, link: string): { subject: string; html: string; text: string } => {
    const subject = `Grades published: ${subjectName} — ${className}`;
    const text = `Hello ${studentName},\n\nYour grades for ${subjectName} (${className}) have been published.\n\nView your results: ${link}\n\n— School Grading System`;
    const html = shell(
      'Grades Published',
      `<h2 style="margin:0 0 16px;font-size:18px;color:#20382e;">Grades Published</h2>
      <p>Hi <strong>${studentName}</strong>,</p>
      <p>Your grades for <strong>${subjectName}</strong> (${className}) have been published.</p>
      ${button(link, 'View grades')}`,
    );
    return { subject, html, text };
  },

  reportCardReady: (studentName: string, semesterName: string, link: string): { subject: string; html: string; text: string } => {
    const subject = `Your report card is ready — ${semesterName}`;
    const text = `Hello ${studentName},\n\nYour report card for ${semesterName} is now available.\n\nOpen it here: ${link}\n\n— School Grading System`;
    const html = shell(
      'Report Card Ready',
      `<h2 style="margin:0 0 16px;font-size:18px;color:#20382e;">Report Card Ready</h2>
      <p>Hi <strong>${studentName}</strong>,</p>
      <p>Your report card for <strong>${semesterName}</strong> is now available.</p>
      ${button(link, 'Open report card')}`,
    );
    return { subject, html, text };
  },

  passwordReset: (name: string, resetLink: string): { subject: string; html: string; text: string } => {
    const subject = 'Reset your password';
    const text = `Hello ${name},\n\nYou requested a password reset. Click the link below to set a new password:\n\n${resetLink}\n\nThis link expires in 15 minutes. If you didn't request this, ignore this email.\n\n— School Grading System`;
    const html = shell(
      'Password Reset',
      `<h2 style="margin:0 0 16px;font-size:18px;color:#20382e;">Password Reset</h2>
      <p>Hi <strong>${name}</strong>,</p>
      <p>You requested a password reset. Click the button below to set a new password.</p>
      ${button(resetLink, 'Reset password')}
      <p style="font-size:13px;color:#78716c;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>`,
    );
    return { subject, html, text };
  },

  announcementBroadcast: (title: string, message: string, link?: string): { subject: string; html: string; text: string } => {
    const subject = `School Announcement: ${title}`;
    const text = `${message}\n\n${link ? `More info: ${link}` : ''}\n\n— School Grading System`;
    const html = shell(
      'Announcement',
      `<h2 style="margin:0 0 16px;font-size:18px;color:#20382e;">School Announcement</h2>
      <h3 style="color:#44403c;margin:0 0 8px;font-size:16px;">${title}</h3>
      <p>${message.replace(/\n/g, '<br>')}</p>
      ${link ? button(link, 'Read more') : ''}`,
    );
    return { subject, html, text };
  },
};
