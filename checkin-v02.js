// TTT OS v0.2 — grouped vehicle condition capture overrides
(function(){
  const PHOTO_GROUPS = [
    {
      id: 'exterior',
      title: 'Exterior',
      description: 'Document the vehicle from every major exterior angle before work begins.',
      areas: [
        'Front', 'Front Left 3/4', 'Front Right 3/4', 'Driver Side / Left',
        'Passenger Side / Right', 'Rear Left 3/4', 'Rear Right 3/4', 'Rear',
        'Roof / Top', 'Wheels / Tires', 'Windshield / Glass'
      ]
    },
    {
      id: 'interior',
      title: 'Interior',
      description: 'Capture cabin condition, customer-touch areas and visible trim before disassembly.',
      areas: [
        'Front Interior', 'Rear Interior', 'Dashboard / Mileage', 'Center Console / Radio Area',
        'Seats / Trim', 'Headliner', 'Cargo / Rear Cabin'
      ]
    },
    {
      id: 'technical',
      title: 'Technical Areas',
      description: 'Record areas that may be accessed, modified or affected by the planned work.',
      areas: [
        'Engine Bay', 'Trunk / Cargo Area', 'Battery / Electrical',
        'Existing Audio / Electronics', 'Existing Wiring / Fuse Areas'
      ]
    },
    {
      id: 'damage',
      title: 'Damage / Noteworthy Areas',
      description: 'Take close-ups of pre-existing damage, unusual conditions or anything that may need special attention.',
      areas: ['Existing Damage Close-Ups', 'Other / Noteworthy Areas']
    }
  ];

  function attr(v){
    return String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function photoCard(groupId, area){
    const key = groupId + '::' + area;
    return '<label class="condition-photo-card">' +
      '<div class="condition-photo-title"><strong>' + esc(area) + '</strong><span>Multiple photos</span></div>' +
      '<input type="file" accept="image/*" capture="environment" multiple data-checkin-photo="' + attr(key) + '" onchange="previewCheckInPhotos(this)">' +
      '<div class="condition-photo-preview" data-checkin-preview="' + attr(key) + '"></div>' +
    '</label>';
  }

  window.previewCheckInPhotos = function(input){
    const target = document.querySelector('[data-checkin-preview="' + CSS.escape(input.dataset.checkinPhoto) + '"]');
    if(!target) return;
    target.innerHTML = '';
    [...input.files].forEach(file => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      target.appendChild(img);
    });
    const count = document.createElement('small');
    count.textContent = input.files.length + (input.files.length === 1 ? ' photo selected' : ' photos selected');
    target.appendChild(count);
  };

  window.previewCheckInVideo = function(input){
    const target = document.querySelector('[data-checkin-video-preview="' + CSS.escape(input.dataset.checkinVideo) + '"]');
    if(!target) return;
    target.innerHTML = '';
    const file = input.files && input.files[0];
    if(!file) return;
    const video = document.createElement('video');
    video.controls = true;
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    target.appendChild(video);
    const label = document.createElement('small');
    label.textContent = file.name;
    target.appendChild(label);
  };

  function groupedPhotoCapture(){
    return PHOTO_GROUPS.map(group =>
      '<section class="condition-group">' +
        '<div class="condition-group-head"><div><h4>' + esc(group.title) + '</h4><p>' + esc(group.description) + '</p></div><span class="condition-group-count">' + group.areas.length + ' areas</span></div>' +
        '<div class="condition-photo-grid">' + group.areas.map(area => photoCard(group.id, area)).join('') + '</div>' +
        '<label class="condition-group-note">' + esc(group.title) + ' notes<textarea data-checkin-note="' + attr(group.id) + '" placeholder="Optional notes specific to this group..."></textarea></label>' +
      '</section>'
    ).join('');
  }

  checkInBlock = function(j){
    const ci = j.checkIn || {};
    if(j.status === 'Ready for Check-In'){
      return '<article class="panel detail-section emphasis checkin-panel">' +
        '<div class="panel-head"><div><h3>Vehicle Check-In</h3><p class="muted">TTT physical custody begins here. Document the vehicle before any work starts.</p></div><span class="badge">Protection checkpoint</span></div>' +
        '<form id="checkInForm">' +
          '<section class="checkin-section custody-section">' +
            '<div class="checkin-section-title"><div><h4>1. Custody Details</h4><p>Record the basic handoff condition when TTT receives the vehicle.</p></div></div>' +
            '<div class="form-grid">' +
              '<label>Odometer<input name="odometer" required placeholder="Mileage"></label>' +
              '<label>Fuel / charge<select name="fuel"><option value="">Select level</option><option>Empty / 0%</option><option>1/8</option><option>1/4</option><option>3/8</option><option>1/2</option><option>5/8</option><option>3/4</option><option>7/8</option><option>Full / 100%</option></select></label>' +
              '<label>Keys received<input name="keys" required placeholder="e.g. 2 keys, 1 remote"></label>' +
              '<label>Warning lights / faults<input name="warningLights" placeholder="None, CEL, TPMS, airbag light..."></label>' +
              '<label class="span-2">Personal belongings<textarea name="belongings" placeholder="Items left in the vehicle, valuables, child seats, tools, etc."></textarea></label>' +
            '</div>' +
          '</section>' +

          '<section class="checkin-section condition-capture-section">' +
            '<div class="checkin-section-title"><div><h4>2. Vehicle Condition Photos</h4><p>Take multiple photos per area as needed. Close-ups should be used for scratches, dents, wheel damage, stains, aftermarket wiring or other noteworthy conditions.</p></div><span class="badge">Before-work evidence</span></div>' +
            groupedPhotoCapture() +
          '</section>' +

          '<section class="checkin-section video-evidence-section">' +
            '<div class="checkin-section-title"><div><h4>3. Video Evidence</h4><p>Optional supporting documentation. Photos remain the primary structured condition record.</p></div><span class="badge">Optional</span></div>' +
            '<div class="checkin-video-grid">' +
              '<label class="checkin-video-card"><strong>360° Exterior Walkaround</strong><span>One continuous exterior walkaround</span><input type="file" accept="video/*" capture="environment" data-checkin-video="Exterior 360 Walkaround" onchange="previewCheckInVideo(this)"><div class="checkin-video-preview" data-checkin-video-preview="Exterior 360 Walkaround"></div></label>' +
              '<label class="checkin-video-card"><strong>Interior Walkthrough</strong><span>Cabin, dashboard, trim and cargo condition</span><input type="file" accept="video/*" capture="environment" data-checkin-video="Interior Walkthrough" onchange="previewCheckInVideo(this)"><div class="checkin-video-preview" data-checkin-video-preview="Interior Walkthrough"></div></label>' +
              '<label class="checkin-video-card"><strong>Functional / Damage Evidence</strong><span>Use for warning lights, noises, electrical faults or specific concerns</span><input type="file" accept="video/*" capture="environment" data-checkin-video="Functional Damage Evidence" onchange="previewCheckInVideo(this)"><div class="checkin-video-preview" data-checkin-video-preview="Functional Damage Evidence"></div></label>' +
            '</div>' +
          '</section>' +

          '<section class="checkin-section overall-condition-section">' +
            '<div class="checkin-section-title"><div><h4>4. Overall Condition Notes</h4><p>Summarize anything that should be called out before customer authorization.</p></div></div>' +
            '<label class="condition-overall-note">Condition / existing damage notes<textarea name="conditionNotes" placeholder="Existing scratches, dents, wheel rash, stains, loose trim, prior wiring, warning lights, customer concerns, etc."></textarea></label>' +
          '</section>' +

          '<div class="checkin-protection-note"><strong>Before completing check-in:</strong> make sure noteworthy damage is photographed closely and the general vehicle condition is represented from enough angles to establish a clear before-work record.</div>' +
          '<button class="btn primary large" type="submit">Complete Check-In</button>' +
        '</form>' +
      '</article>';
    }

    const photos = ci.photos || [];
    const videos = ci.videos || [];
    const groupCounts = PHOTO_GROUPS.map(group => {
      const count = photos.filter(p => p.group === group.id).length;
      return '<div class="condition-summary-item"><span>' + esc(group.title) + '</span><strong>' + count + '</strong><small>photo' + (count === 1 ? '' : 's') + '</small></div>';
    }).join('');

    return '<article class="panel detail-section">' +
      '<div class="panel-head"><div><h3>Check-In Record</h3><p class="muted">Vehicle condition documented before work authorization.</p></div><span class="badge">Recorded</span></div>' +
      '<dl class="detail-list two-col">' +
        '<dt>Odometer</dt><dd>' + esc(ci.odometer || '—') + '</dd>' +
        '<dt>Fuel / charge</dt><dd>' + esc(ci.fuel || '—') + '</dd>' +
        '<dt>Keys</dt><dd>' + esc(ci.keys || '—') + '</dd>' +
        '<dt>Warning lights</dt><dd>' + esc(ci.warningLights || 'None noted') + '</dd>' +
        '<dt>Belongings</dt><dd>' + esc(ci.belongings || 'None noted') + '</dd>' +
        '<dt>Condition notes</dt><dd>' + esc(ci.conditionNotes || 'None noted') + '</dd>' +
      '</dl>' +
      '<div class="condition-summary-grid">' + groupCounts + '<div class="condition-summary-item"><span>Videos</span><strong>' + videos.length + '</strong><small>recorded</small></div></div>' +
    '</article>';
  };

  saveCheckIn = function(e,j){
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const now = new Date().toISOString();

    const photos = [];
    form.querySelectorAll('[data-checkin-photo]').forEach(input => {
      const [group, area] = input.dataset.checkinPhoto.split('::');
      [...input.files].forEach(file => photos.push({
        id: uid('med'),
        mediaType: 'photo',
        group,
        area,
        fileName: file.name,
        mime: file.type,
        size: file.size,
        capturedAt: now,
        storageStatus: 'local-metadata-only'
      }));
    });

    const videos = [];
    form.querySelectorAll('[data-checkin-video]').forEach(input => {
      [...input.files].forEach(file => videos.push({
        id: uid('med'),
        mediaType: 'video',
        category: input.dataset.checkinVideo,
        fileName: file.name,
        mime: file.type,
        size: file.size,
        capturedAt: now,
        storageStatus: 'local-metadata-only'
      }));
    });

    const groupNotes = {};
    form.querySelectorAll('[data-checkin-note]').forEach(el => groupNotes[el.dataset.checkinNote] = el.value);

    j.checkIn = {
      odometer: fd.get('odometer'),
      fuel: fd.get('fuel'),
      keys: fd.get('keys'),
      warningLights: fd.get('warningLights'),
      belongings: fd.get('belongings'),
      conditionNotes: fd.get('conditionNotes'),
      groupNotes,
      photos,
      videos,
      photoCount: photos.length,
      videoCount: videos.length,
      capturedAt: now,
      capturedBy: 'usr_derek'
    };

    j.status = 'Checked In';
    j.audit.push({
      at: now,
      actor: 'usr_derek',
      action: 'vehicle_checked_in',
      photoCount: photos.length,
      videoCount: videos.length
    });
    save();
    render();
    toast('Vehicle checked in · ' + photos.length + ' photos documented');
  };
})();
