import { UserRole } from '../types';
import { authorizeGmailSending, clearCachedGmailAccessToken } from '../lib/firebase';

export interface AuthorizationEmailPayload {
  recipientName: string;
  recipientEmail: string;
  role: UserRole;
  department?: string;
  courseAssigned?: string;
  level?: string;
  stream?: string;
  approvedByName: string;
  approvedByEmail?: string;
  portalUrl?: string;
}

export interface SendGmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const encodeBase64UrlUtf8 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const encodeSubjectRfc2047 = (subject: string): string => {
  const bytes = new TextEncoder().encode(subject);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?UTF-8?B?${btoa(binary)}?=`;
};

const formatRoleTitle = (role: UserRole): string => {
  if (role === 'hod') return 'Head of Department (HOD)';
  if (role === 'class_rep') return 'Class Representative';
  return 'Course Lecturer';
};

export function buildAuthorizationEmailSubject(payload: AuthorizationEmailPayload): string {
  const roleLabel = formatRoleTitle(payload.role);
  return `[UENR ITDS] Portal Access Approved (${roleLabel}) — Action Required to Activate`;
}

export function buildAuthorizationEmailRaw(payload: AuthorizationEmailPayload): string {
  const recipientEmail = payload.recipientEmail.trim().toLowerCase();
  const recipientName = payload.recipientName.trim() || 'Academic Personnel';
  const roleTitle = formatRoleTitle(payload.role);
  const dept = payload.department || 'Department of Information Technology & Decision Sciences';
  const portalUrl = payload.portalUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const subject = buildAuthorizationEmailSubject(payload);

  const assignmentLines: string[] = [];
  if (payload.role === 'lecturer') {
    assignmentLines.push(
      `<li><strong>Assigned Courses:</strong> ${escapeHtml(payload.courseAssigned?.trim() || 'Will be assigned by HOD')}</li>`
    );
  }
  if (payload.role === 'class_rep') {
    if (payload.level) {
      assignmentLines.push(`<li><strong>Class Level:</strong> ${escapeHtml(payload.level)}</li>`);
    }
    if (payload.stream) {
      assignmentLines.push(`<li><strong>Class Division / Stream:</strong> ${escapeHtml(payload.stream)}</li>`);
    }
  }

  const htmlBody = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background-color:#f4f7f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe4ea;">
      <tr>
        <td style="background:#003b5c;padding:24px 28px;color:#ffffff;">
          <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#8dc63f;font-weight:bold;">
            University of Energy &amp; Natural Resources · ITDS
          </div>
          <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;color:#ffffff;">
            Departmental Portal Authorization Notice
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding:26px 28px;font-size:14px;line-height:1.6;">
          <p style="margin:0 0 14px;">Dear <strong>${escapeHtml(recipientName)}</strong>,</p>
          <p style="margin:0 0 16px;">
            You have been authorized by <strong>${escapeHtml(payload.approvedByName)}</strong>${
              payload.approvedByEmail ? ` (${escapeHtml(payload.approvedByEmail)})` : ''
            } to access the <strong>UENR Attendance &amp; Academic Integrity Portal</strong>.
          </p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
            <div style="font-size:12px;font-weight:bold;text-transform:uppercase;color:#007c82;margin-bottom:8px;">
              Authorization Summary
            </div>
            <ul style="margin:0;padding-left:18px;font-size:13px;color:#334155;">
              <li><strong>Google Account:</strong> ${escapeHtml(recipientEmail)}</li>
              <li><strong>Assigned Role:</strong> ${escapeHtml(roleTitle)}</li>
              <li><strong>Department:</strong> ${escapeHtml(dept)}</li>
              ${assignmentLines.join('\n              ')}
              <li><strong>Status:</strong> Pending Your Confirmation</li>
            </ul>
          </div>
          <p style="margin:0 0 18px;">
            <strong>Next Step (Two-Step Approval):</strong> Please sign into the portal using this Google account (<strong>${escapeHtml(recipientEmail)}</strong>) and click <strong>Approve &amp; Activate Portal</strong> on your authorization notice screen to unlock your dashboard. If any assigned course or division is inaccurate, you may flag it directly from the same screen.
          </p>
          ${
            portalUrl
              ? `<p style="margin:0 0 20px;">
            <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#007c82;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px;font-size:14px;">
              Open UENR Attendance Portal &amp; Confirm Access
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;color:#64748b;">
            Direct portal link: <a href="${escapeHtml(portalUrl)}" style="color:#007c82;">${escapeHtml(portalUrl)}</a>
          </p>`
              : ''
          }
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0 14px;" />
          <p style="margin:0;font-size:12px;color:#64748b;">
            This authorization was recorded by the Department of Information Technology &amp; Decision Sciences (UENR Sunyani).
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const headers = [
    `To: ${recipientEmail}`,
    `Subject: ${encodeSubjectRfc2047(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64'
  ];

  // Encode HTML body as cleanly wrapped base64 for strict RFC 2822 compliance
  const htmlBytes = new TextEncoder().encode(htmlBody);
  let htmlBinary = '';
  for (let i = 0; i < htmlBytes.length; i += 1) {
    htmlBinary += String.fromCharCode(htmlBytes[i]);
  }
  const bodyBase64 = btoa(htmlBinary).replace(/(.{76})/g, '$1\r\n');

  const mimeMessage = `${headers.join('\r\n')}\r\n\r\n${bodyBase64}`;
  return encodeBase64UrlUtf8(mimeMessage);
}

/**
 * Sends a confirmation notification to an authorized Lecturer or Class Rep's Gmail inbox.
 * Must only be invoked after explicit user confirmation in UI.
 */
export async function sendAuthorizationGmailNotice(
  payload: AuthorizationEmailPayload,
  senderLoginHint?: string
): Promise<SendGmailResult> {
  const raw = buildAuthorizationEmailRaw(payload);

  const attemptSend = async (accessToken: string): Promise<Response> =>
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw })
    });

  try {
    let token = await authorizeGmailSending(senderLoginHint, false);
    let response = await attemptSend(token);

    // If cached token lacks gmail.send consent or expired, force fresh consent popup once
    if (response.status === 401 || response.status === 403) {
      clearCachedGmailAccessToken();
      token = await authorizeGmailSending(senderLoginHint, true);
      response = await attemptSend(token);
    }

    if (!response.ok) {
      let detail = `Gmail API returned HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        detail = errJson?.error?.message || detail;
      } catch {
        // ignore JSON parse error
      }
      return { success: false, error: detail };
    }

    const data = (await response.json()) as { id?: string };
    return { success: true, messageId: data.id };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return { success: false, error: 'Gmail permission popup was cancelled before sending.' };
    }
    const msg = err instanceof Error ? err.message : 'Unable to send Gmail notification.';
    return { success: false, error: msg };
  }
}
