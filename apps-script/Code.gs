// EventForm AI — Google Form builder.
// Deploy: script.google.com → New project → paste this → Deploy → New deployment →
// type "Web app", Execute as "Me", Who has access "Anyone" → copy the /exec URL into APPS_SCRIPT_URL.
var SECRET = 'change-me'; // must equal FORM_SECRET in Vercel

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    if (SECRET && p.secret !== SECRET) return json_({ ok: false, error: 'unauthorized' });

    var form = FormApp.create(String(p.title || 'Event Feedback').slice(0, 120));
    form.setDescription(String(p.description || ''));
    form.setCollectEmail(false);
    form.setProgressBar(true);
    form.setConfirmationMessage('Thank you! Your feedback helps us make the next event better.');

    var n = 0;
    (p.questions || []).forEach(function (q) {
      var item;
      var opts = (q.options || []).filter(String);
      switch (q.type) {
        case 'rating':
          item = form.addScaleItem().setBounds(1, 5).setLabels('Poor', 'Excellent');
          break;
        case 'single_choice':
          item = form.addMultipleChoiceItem().setChoiceValues(opts);
          break;
        case 'multiple_choice':
          item = form.addCheckboxItem().setChoiceValues(opts);
          break;
        case 'long_text':
          item = form.addParagraphTextItem();
          break;
        default:
          item = form.addTextItem();
      }
      item.setTitle(String(q.question)).setRequired(q.required !== false);
      n++;
    });

    // Newer Forms may be created unpublished; publish explicitly when supported.
    try { form.setPublished(true); } catch (err) {}
    try { form.setAcceptingResponses(true); } catch (err) {}

    // Make the responder link open to anyone (best effort; harmless if not permitted).
    try {
      DriveApp.getFileById(form.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err) {}

    return json_({ ok: true, formUrl: form.getPublishedUrl(), questionCount: n });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'EventForm AI form builder' });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Run this once from the editor (select "authorize" → Run) to grant Forms + Drive permissions before deploying.
function authorize() {
  var f = FormApp.create('EventForm AI — permission check');
  DriveApp.getFileById(f.getId()).setTrashed(true);
  Logger.log('Authorized OK');
}
