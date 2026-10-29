import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Loader2,
  Lock,
  LogOut,
  Pencil,
  RefreshCw,
  Search
} from 'lucide-react';
import { downloadFile, fetchApi } from './services/api';

interface DashboardRow {
  id_affectation_cours: string;
  id_sequence: string;
  classe: string;
  matiere: string;
  enseignant: string;
  coefficient: number;
  trimestre: number;
  sequence: number;
  effectif: number;
  notes_saisies: number;
  statut: 'verrouille' | 'brouillon';
  date_verrouillage: string | null;
  nom_fichier: string;
}

interface DashboardResponse {
  annee: string;
  rows: DashboardRow[];
}

interface AdminDashboardProps {
  onLogout: () => void;
}

type StatutFilter = 'tous' | 'verrouille' | 'brouillon';

const rowKey = (r: DashboardRow) => `${r.id_affectation_cours}|${r.id_sequence}`;
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '');

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState<StatutFilter>('tous');
  const [classe, setClasse] = useState('');
  const [trimestre, setTrimestre] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchApi('/dashboard/liste') as DashboardResponse;
        if (cancelled) return;
        setData(res);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Erreur lors du chargement du tableau de bord.';
        if (/session|token/i.test(message)) {
          onLogout();
          return;
        }
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey, onLogout]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshKey(k => k + 1);
  };

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const classes = useMemo(
    () => [...new Set(rows.map(r => r.classe))].sort((a, b) => a.localeCompare(b, 'fr')),
    [rows]
  );
  const trimestres = useMemo(
    () => [...new Set(rows.map(r => r.trimestre))].sort((a, b) => a - b),
    [rows]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(r =>
      (statut === 'tous' || r.statut === statut) &&
      (!classe || r.classe === classe) &&
      (!trimestre || String(r.trimestre) === trimestre) &&
      (!term || `${r.classe} ${r.matiere} ${r.enseignant}`.toLowerCase().includes(term))
    );
  }, [rows, search, statut, classe, trimestre]);

  const nbVerrouilles = rows.filter(r => r.statut === 'verrouille').length;
  const nbBrouillons = rows.length - nbVerrouilles;
  const nbClasses = classes.length;

  const handleDownload = async (row: DashboardRow) => {
    const id = rowKey(row);
    setDownloading(id);
    setError(null);
    try {
      await downloadFile(
        `/dashboard/export?id_affectation_cours=${row.id_affectation_cours}&id_sequence=${row.id_sequence}`,
        row.nom_fichier
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Le téléchargement a échoué.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* En-tête */}
        <div className="bg-[#0B1F4B] text-white p-6 border-b-4 border-[#C9A227] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-xl font-bold text-[#C9A227]">Fichiers de notes</h1>
            <p className="text-xs text-blue-200 mt-1">
              Collège Catholique Saint Charles Borromée, année {data?.annee ?? '...'}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg font-semibold cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 px-3 py-2 rounded-lg font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>

        {/* Bandeau de chiffres */}
        <dl className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50 text-center">
          {[
            { label: 'Fichiers', value: rows.length },
            { label: 'Verrouillés', value: nbVerrouilles },
            { label: 'Brouillons', value: nbBrouillons },
            { label: 'Classes concernées', value: nbClasses }
          ].map(item => (
            <div key={item.label} className="py-4 px-2">
              <dd className="font-serif text-2xl font-bold text-[#0B1F4B]">{item.value}</dd>
              <dt className="text-xs text-slate-500 mt-0.5">{item.label}</dt>
            </div>
          ))}
        </dl>

        {/* Filtres */}
        <div className="p-4 sm:px-6 border-b border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une classe, une matière ou un enseignant"
              aria-label="Rechercher"
              className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#C9A227]"
            />
          </div>
          <select
            value={classe}
            onChange={e => setClasse(e.target.value)}
            aria-label="Filtrer par classe"
            className="border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#C9A227]"
          >
            <option value="">Toutes les classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={trimestre}
              onChange={e => setTrimestre(e.target.value)}
              aria-label="Filtrer par trimestre"
              className="border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#C9A227]"
            >
              <option value="">Trimestres</option>
              {trimestres.map(t => <option key={t} value={t}>Trimestre {t}</option>)}
            </select>
            <select
              value={statut}
              onChange={e => setStatut(e.target.value as StatutFilter)}
              aria-label="Filtrer par statut"
              className="border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#C9A227]"
            >
              <option value="tous">Tous les statuts</option>
              <option value="verrouille">Verrouillés</option>
              <option value="brouillon">Brouillons</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-4 text-xs flex items-center gap-3 border-b bg-rose-50 text-rose-800 border-rose-200" role="alert">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* Tableau */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-2 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-[#0B1F4B]" />
              <span className="text-xs">Chargement des fichiers de notes...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500 space-y-1">
              <FileSpreadsheet className="w-10 h-10 mx-auto opacity-40 text-[#0B1F4B]" />
              <p className="font-bold text-slate-700">Aucun fichier de notes pour le moment.</p>
              <p>Les fichiers apparaissent ici dès qu’un enseignant enregistre un brouillon ou valide une séquence.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500">
              <p className="font-bold text-slate-700">Aucun résultat avec ces filtres.</p>
              <p>Modifiez la recherche ou réinitialisez les filtres.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#0B1F4B] text-white">
                <tr>
                  <th className="p-3 font-bold">Classe</th>
                  <th className="p-3 font-bold">Matière</th>
                  <th className="p-3 font-bold hidden lg:table-cell">Enseignant</th>
                  <th className="p-3 font-bold text-center">Séquence</th>
                  <th className="p-3 font-bold">Notes saisies</th>
                  <th className="p-3 font-bold">Statut</th>
                  <th className="p-3 font-bold hidden xl:table-cell">Nom du fichier</th>
                  <th className="p-3 font-bold text-center">Excel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((r, index) => {
                  const id = rowKey(r);
                  const complet = r.effectif > 0 && r.notes_saisies >= r.effectif;
                  const pct = r.effectif > 0 ? Math.min(100, Math.round((r.notes_saisies / r.effectif) * 100)) : 0;
                  return (
                    <tr key={id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-amber-50/40`}>
                      <td className="p-3 font-bold text-[#0B1F4B] whitespace-nowrap">{r.classe}</td>
                      <td className="p-3">
                        <span className="font-semibold">{r.matiere}</span>
                        <span className="text-slate-400"> (coef {r.coefficient})</span>
                      </td>
                      <td className="p-3 hidden lg:table-cell text-slate-600">{r.enseignant}</td>
                      <td className="p-3 text-center whitespace-nowrap">T{r.trimestre} / S{r.sequence}</td>
                      <td className="p-3 min-w-36">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${complet ? 'bg-emerald-600' : 'bg-[#C9A227]'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-slate-600 whitespace-nowrap">{r.notes_saisies}/{r.effectif}</span>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {r.statut === 'verrouille' ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 font-semibold">
                            <Lock className="w-3 h-3" />
                            <span>Verrouillé{r.date_verrouillage ? ` le ${formatDate(r.date_verrouillage)}` : ''}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 font-semibold">
                            <Pencil className="w-3 h-3" />
                            <span>Brouillon</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 hidden xl:table-cell font-mono text-[11px] text-slate-500 break-all max-w-64">
                        {r.nom_fichier}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDownload(r)}
                          disabled={downloading === id}
                          title={r.nom_fichier}
                          aria-label={`Télécharger ${r.nom_fichier}`}
                          className="inline-flex items-center gap-1.5 bg-[#0B1F4B] hover:bg-[#12306e] text-white px-3 py-1.5 rounded-lg font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {downloading === id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Download className="w-3.5 h-3.5" />}
                          <span>Télécharger</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-xs text-slate-500">
          {filtered.length} fichier{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''} sur {rows.length}
        </div>
      </div>
    </div>
  );
};
