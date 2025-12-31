import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useTranslation } from 'react-i18next';
import "./style.css";

const BACKEND = process.env.REACT_APP_BACKEND_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:8000/api" : "https://senior-caregiver.onrender.com/api");

export default function App() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState("senior"); // 'senior' or 'caregiver'
  const [tab, setTab] = useState("dashboard"); // 'dashboard', 'meds', 'profile'
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  // Data
  const [senior, setSenior] = useState({ name: "Senior User", emergency_info: "" });
  const [medications, setMedications] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [adherence, setAdherence] = useState({ total: 0, taken: 0, percentage: 0 });

  // Form State
  const [medForm, setMedForm] = useState({ name: "", dosage: "", time: "09:00", frequency: "daily", pill_color: "white" });

  const colors = [
    { name: "white", hex: "#ffffff" },
    { name: "red", hex: "#ef4444" },
    { name: "blue", hex: "#3b82f6" },
    { name: "green", hex: "#22c55e" },
    { name: "yellow", hex: "#eab308" },
    { name: "orange", hex: "#f97316" },
    { name: "purple", hex: "#8b5cf6" }
  ];

  useEffect(() => {
    fetchData();
    const interval = setInterval(checkReminders, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [seniorRes, medsRes, schedRes, statsRes] = await Promise.all([
        axios.get(`${BACKEND}/senior/1`),
        axios.get(`${BACKEND}/medications?senior_id=1`),
        axios.get(`${BACKEND}/today-schedule?senior_id=1`),
        axios.get(`${BACKEND}/adherence-summary?senior_id=1`)
      ]);
      setSenior(seniorRes.data);
      setMedications(medsRes.data);
      setSchedule(schedRes.data);
      setAdherence(statsRes.data);
    } catch (err) {
      showNotice(t("error_loading"));
    } finally {
      setLoading(false);
    }
  }

  const showNotice = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 4000);
  };

  const speak = (text) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.8;
    u.pitch = 1.0;
    const langMap = {
      en: 'en-US',
      hi: 'hi-IN',
      es: 'es-ES',
      fr: 'fr-FR',
      ar: 'ar-SA',
      bn: 'bn-IN',
      ta: 'ta-IN',
      te: 'te-IN',
      mr: 'mr-IN',
      ml: 'ml-IN',
      or: 'or-IN'
    };
    u.lang = langMap[i18n.language] || 'en-US';
    window.speechSynthesis.speak(u);
  };

  const checkReminders = () => {
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    schedule.forEach(m => {
      if (m.time === currentTime && !m.log) {
        speak(t("speak_reminder", { color: m.pill_color, name: m.name }));
        showNotice(t("time_for", { name: m.name }));
      }
    });
  };

  const readAllMeds = () => {
    const due = schedule.filter(m => !m.log);
    if (due.length === 0) {
      speak(t("speak_all_taken"));
      return;
    }
    const list = due.map(m => t("med_description", { color: m.pill_color, name: m.name })).join(", ");
    speak(t("speak_meds_list", { count: due.length, list }));
  };

  const acknowledge = async (medId) => {
    try {
      await axios.post(`${BACKEND}/acknowledge`, { medication_id: medId, status: "taken" });
      showNotice(t("med_log_success"));
      fetchData();
      speak(t("speak_taken_confirmation"));
    } catch (err) {
      showNotice(t("med_log_failed"));
    }
  };

  const handleScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    showNotice(t("scanning_prescription"));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${BACKEND}/scan-prescription`, formData);
      const data = res.data.extracted_data;
      setMedForm({ ...medForm, name: data.name || "", dosage: data.dosage || "", time: data.time || "09:00", pill_color: data.pill_color || "white" });
      showNotice(t("scan_complete"));
    } catch (err) {
      showNotice(t("scan_failed"));
    } finally {
      setLoading(false);
    }
  };

  const saveMed = async () => {
    if (!medForm.name) return showNotice(t("name_required"));
    try {
      await axios.post(`${BACKEND}/medications`, medForm);
      setMedForm({ name: "", dosage: "", time: "09:00", frequency: "daily", pill_color: "white" });
      showNotice(t("medicine_saved"));
      fetchData();
    } catch (err) {
      showNotice(t("save_failed"));
    }
  };

  const updateProfile = async () => {
    try {
      await axios.post(`${BACKEND}/senior/1`, senior);
      showNotice(t("profile_updated"));
    } catch (err) {
      showNotice(t("update_failed"));
    }
  };

  return (
    <div className={`container ${mode === 'senior' ? 'senior-mode' : 'caregiver-mode'}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
        <select
          className="lang-selector"
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          value={i18n.language}
        >
          <option value="en">English</option>
          <option value="hi">हिंदी (Hindi)</option>
          <option value="es">Español (Spanish)</option>
          <option value="fr">Français (French)</option>
          <option value="ar">العربية (Arabic)</option>
          <option value="bn">বাংলা (Bengali)</option>
          <option value="mr">मराठी (Marathi)</option>
          <option value="ml">മലയാളം (Malayalam)</option>
          <option value="or">ଓଡ଼ିଆ (Odia)</option>
          <option value="ta">தமிழ் (Tamil)</option>
          <option value="te">తెలుగు (Telugu)</option>
        </select>
        <button onClick={() => setMode(mode === 'senior' ? 'caregiver' : 'senior')} style={{ background: '#eee', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: '#000' }}>
          {mode === 'senior' ? t("caregiver_dashboard") : t("senior_screen")}
        </button>
      </div>

      {notice && <div className="notice">{notice}</div>}

      {mode === 'senior' ? (
        <div className="senior-ui">
          <h1>{t("project_name")}</h1>

          <button className="main-action" onClick={readAllMeds}>
            {t("read_meds_btn")}<br /><span style={{ fontSize: '1.5rem' }}>{t("out_loud")}</span>
          </button>

          <div className="med-card">
            <h2 style={{ fontSize: '3rem', marginTop: 0 }}>{t("medication_checklist")}</h2>
            {schedule.length === 0 ? <p style={{ fontSize: '2rem' }}>{t("no_meds_scheduled")}</p> :
              schedule.map(m => (
                <div key={m.id} className={`med-item ${m.log ? 'taken' : ''}`}>
                  <div className="pill-icon" style={{ background: colors.find(c => c.name === m.pill_color)?.hex || '#fff' }}></div>
                  <div className="med-info" style={{ flex: 1 }}>
                    <strong style={{ color: '#000' }}>{m.name}</strong>
                    <span>{m.dosage} • {m.time}</span>
                  </div>
                  {!m.log ? (
                    <button className="btn-taken" onClick={() => acknowledge(m.id)}>{t("i_took_it")}</button>
                  ) : (
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>{t("done")}</div>
                  )}
                </div>
              ))
            }
          </div>

          {senior.emergency_info && (
            <div className="emergency-strip" style={{ fontSize: '2rem', padding: '2rem' }}>
              {t("emergency_info_label")}<br />{senior.emergency_info}
            </div>
          )}
        </div>
      ) : (
        <div className="caregiver-ui">
          <h1 style={{ color: 'var(--primary)', borderBottom: '4px solid var(--primary)', paddingBottom: '0.5rem' }}>{t("caregiver_ui_title")}</h1>

          <div className="tabs" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <button onClick={() => setTab("dashboard")} style={{ flex: 1, padding: '1rem', background: tab === 'dashboard' ? 'var(--primary)' : '#eee', color: tab === 'dashboard' ? '#fff' : '#000', borderRadius: '1rem' }}>{t("tab_today")}</button>
            <button onClick={() => setTab("meds")} style={{ flex: 1, padding: '1rem', background: tab === 'meds' ? 'var(--primary)' : '#eee', color: tab === 'meds' ? '#fff' : '#000', borderRadius: '1rem' }}>{t("tab_meds")}</button>
            <button onClick={() => setTab("profile")} style={{ flex: 1, padding: '1rem', background: tab === 'profile' ? 'var(--primary)' : '#eee', color: tab === 'profile' ? '#fff' : '#000', borderRadius: '1rem' }}>{t("tab_profile")}</button>
          </div>

          {tab === "dashboard" && (
            <div className="card">
              <div className="stats-grid">
                <div className="stat-card">
                  <h3>{t("taken_today")}</h3>
                  <p>{adherence.taken} / {adherence.total}</p>
                </div>
                <div className="stat-card">
                  <h3>{t("adherence")}</h3>
                  <p>{adherence.percentage}%</p>
                </div>
              </div>

              <h3>{t("current_schedule")}</h3>
              <div className="schedule-list">
                {schedule.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #eee' }}>
                    <div>
                      <strong>{m.name}</strong> ({m.dosage}) at {m.time}
                    </div>
                    <div style={{ color: m.log ? 'var(--success)' : 'var(--danger)', fontWeight: 800 }}>
                      {m.log ? `${t("taken_at")} ${new Date(m.log.taken_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : t("pending")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "meds" && (
            <div className="card">
              <h3>{t("add_new_med")}</h3>
              <label className="secondary" style={{ display: 'block', padding: '1rem', background: '#475569', color: '#fff', textAlign: 'center', borderRadius: '1rem', cursor: 'pointer', marginBottom: '1.5rem' }}>
                {t("scan_btn")}
                <input type="file" hidden accept="image/*" onChange={handleScan} />
              </label>

              {loading && <div style={{ textAlign: 'center', marginBottom: '1rem' }}><div className="loader"></div> {t("processing")}</div>}

              <input placeholder={t("med_name_placeholder")} value={medForm.name} onChange={e => setMedForm({ ...medForm, name: e.target.value })} />
              <input placeholder={t("dosage_placeholder")} value={medForm.dosage} onChange={e => setMedForm({ ...medForm, dosage: e.target.value })} />

              <div style={{ display: 'flex', gap: '1rem' }}>
                <input type="time" value={medForm.time} onChange={e => setMedForm({ ...medForm, time: e.target.value })} />
                <select value={medForm.frequency} onChange={e => setMedForm({ ...medForm, frequency: e.target.value })}>
                  <option value="daily">{t("daily")}</option>
                  <option value="weekly">{t("weekly")}</option>
                </select>
              </div>

              <div className="pill-grid">
                {colors.map(c => (
                  <button key={c.name} className={`pill-btn ${medForm.pill_color === c.name ? 'active' : ''}`} style={{ background: c.hex, border: '4px solid #000' }} onClick={() => setMedForm({ ...medForm, pill_color: c.name })} />
                ))}
              </div>

              <button className="primary" onClick={saveMed} style={{ background: 'var(--primary)', color: '#fff', padding: '1.5rem', borderRadius: '1rem', width: '100%' }}>{t("save_to_schedule")}</button>

              <h3 style={{ marginTop: '3rem' }}>{t("all_registered_meds")}</h3>
              <div className="meds-list">
                {medications.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: '#f8fafc', marginBottom: '0.5rem', borderRadius: '1rem' }}>
                    <div>
                      <strong>{m.name}</strong><br />
                      <small>{m.dosage} • {m.time}</small>
                    </div>
                    <button onClick={async () => { await axios.delete(`${BACKEND}/medications/${m.id}`); fetchData(); }} style={{ background: 'none', color: 'var(--danger)', fontSize: '1.5rem' }}>🗑️</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "profile" && (
            <div className="card">
              <h3>{t("senior_profile_details")}</h3>
              <label>{t("senior_name")}</label>
              <input value={senior.name} onChange={e => setSenior({ ...senior, name: e.target.value })} />

              <label>{t("emergency_instructions")}</label>
              <textarea rows={4} value={senior.emergency_info} onChange={e => setSenior({ ...senior, emergency_info: e.target.value })} placeholder="Who to call? Known allergies? Home address?" />

              <button className="primary" onClick={updateProfile} style={{ background: 'var(--primary)', color: '#fff', padding: '1.5rem', borderRadius: '1rem', width: '100%' }}>{t("update_profile")}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
