
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Tab, BookingSubTab, ItineraryItem, FlightBooking, StayBooking, CarBooking, AttractionBooking, ShoppingItem, Expense } from './types';
import { DATE_RANGE, MEMBERS, Icons, FLIGHT_DB, DEFAULT_PACKING } from './constants';
import { magicalCorrectLocation, estimateTransportTime, testConnection } from './geminiService';
import { pushToRoom, subscribeToRoom } from './firebaseService';

const storage = {
  get: <T,>(key: string, defaultValue: T): T => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch { return defaultValue; }
  },
  set: (key: string, value: any) => localStorage.setItem(key, JSON.stringify(value))
};

const getTransportLink = (origin: string, destination: string, mode: 'transit' | 'drive' | 'walk') => {
  const travelMode = mode === 'drive' ? 'driving' : mode === 'walk' ? 'walking' : 'transit';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${travelMode}`;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('itinerary');
  const [bookingTab, setBookingTab] = useState<BookingSubTab>('flights');
  const [selectedDay, setSelectedDay] = useState(DATE_RANGE[0].date);
  const [currentUser, setCurrentUser] = useState(storage.get('wizard_user', '小語'));

  const [itinerary, setItinerary] = useState<ItineraryItem[]>(storage.get('itinerary_muggle', []));
  const [flights, setFlights] = useState<FlightBooking[]>(storage.get('flights_muggle', []));
  const [stays, setStays] = useState<StayBooking[]>(storage.get('stays_muggle', []));
  const [cars, setCars] = useState<CarBooking[]>(storage.get('cars_muggle', []));
  const [attractions, setAttractions] = useState<AttractionBooking[]>(storage.get('attractions_muggle', []));
  const [shopping, setShopping] = useState<ShoppingItem[]>(storage.get('shopping_muggle', []));
  const [expenses, setExpenses] = useState<Expense[]>(storage.get('expenses_muggle', []));
  const [userPackingLists, setUserPackingLists] = useState<Record<string, string[]>>(storage.get('wizard_packing_lists', {}));
  const [packingChecked, setPackingChecked] = useState<Record<string, string[]>>(storage.get('packing_checked', {}));
  const [exchangeRate, setExchangeRate] = useState(0.215);

  const roomId = 'tokyo-witches'; 
  const [isLiveSync, setIsLiveSync] = useState(storage.get('magic_live_sync', true));
  const remoteUpdateRef = useRef(false);

  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const [showModal, setShowModal] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [testResult, setTestResult] = useState<{ ok?: boolean; msg?: string }>({});

  useEffect(() => {
    storage.set('itinerary_muggle', itinerary);
    storage.set('flights_muggle', flights);
    storage.set('stays_muggle', stays);
    storage.set('cars_muggle', cars);
    storage.set('attractions_muggle', attractions);
    storage.set('shopping_muggle', shopping);
    storage.set('expenses_muggle', expenses);
    storage.set('wizard_packing_lists', userPackingLists);
    storage.set('packing_checked', packingChecked);
    storage.set('wizard_user', currentUser);
    storage.set('magic_live_sync', isLiveSync);
  }, [itinerary, flights, stays, cars, attractions, shopping, expenses, userPackingLists, packingChecked, currentUser, isLiveSync]);

  useEffect(() => {
    if (!isLiveSync) return;
    if (remoteUpdateRef.current) {
      remoteUpdateRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const allData = { itinerary, flights, stays, cars, attractions, shopping, expenses, userPackingLists, packingChecked };
      pushToRoom(roomId, allData);
    }, 2000);
    return () => clearTimeout(timer);
  }, [itinerary, flights, stays, cars, attractions, shopping, expenses, userPackingLists, packingChecked, isLiveSync]);

  useEffect(() => {
    if (!isLiveSync) return;
    const unsubscribe = subscribeToRoom(roomId, (remoteData) => {
      remoteUpdateRef.current = true;
      if (remoteData.itinerary) setItinerary(remoteData.itinerary);
      if (remoteData.flights) setFlights(remoteData.flights);
      if (remoteData.stays) setStays(remoteData.stays);
      if (remoteData.cars) setCars(remoteData.cars);
      if (remoteData.attractions) setAttractions(remoteData.attractions);
      if (remoteData.shopping) setShopping(remoteData.shopping);
      if (remoteData.expenses) setExpenses(remoteData.expenses);
      if (remoteData.userPackingLists) setUserPackingLists(remoteData.userPackingLists);
      if (remoteData.packingChecked) setPackingChecked(remoteData.packingChecked);
    });
    return () => unsubscribe();
  }, [isLiveSync]);

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/JPY')
      .then(r => r.json())
      .then((d: any) => { if (d?.rates?.TWD) setExchangeRate(d.rates.TWD); })
      .catch(() => {});
  }, []);

  const sortedItinerary = useMemo(() => itinerary.filter(i => i.day === selectedDay).sort((a, b) => a.time.localeCompare(b.time)), [itinerary, selectedDay]);

  const handleToggleAction = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedItems(next);
  };

  const saveModal = () => {
    if (!editData) return;
    const id = editData.id || crypto.randomUUID();
    const data = { ...editData, id };

    if (showModal === 'itinerary') {
      const payload = { ...data, day: selectedDay };
      setItinerary(prev => editData.id ? prev.map(x => x.id === id ? payload : x) : [...prev, payload]);
    } else if (showModal === 'flight') setFlights(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, data]);
    else if (showModal === 'stay') setStays(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, data]);
    else if (showModal === 'car') setCars(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, data]);
    else if (showModal === 'attraction') setAttractions(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, data]);
    else if (showModal === 'shopping') setShopping(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, data]);
    else if (showModal === 'packing') {
      const list = userPackingLists[currentUser] || DEFAULT_PACKING;
      const newList = editData.isNew ? [...list, editData.name] : list.map((x: string, i: number) => i === editData.index ? editData.name : x);
      setUserPackingLists(prev => ({ ...prev, [currentUser]: newList }));
    }
    else if (showModal === 'expense') {
      setExpenses(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, { ...data, createdAt: Date.now() }]);
    }
    setShowModal(null);
  };

  return (
    <div className="max-w-[480px] mx-auto min-h-screen bg-[#f5f5f5] flex flex-col relative shadow-2xl overflow-hidden pb-32">
      <header className="sticky top-0 z-40 glass border-b border-[#946A2D]/30 px-6 py-6 text-left flex justify-between items-end">
        <div>
          <h1 className="serif text-2xl font-bold tracking-tight text-[#0E1A40]">東京小怪獸富士山巫師之旅</h1>
          <p className="text-[9px] uppercase tracking-[0.3em] text-[#946A2D] font-bold mt-1">2026.01.29 - 02.02</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold bg-[#0E1A40] text-white px-3 py-1.5 rounded-full shadow-lg border border-[#946A2D]/40">{currentUser}</span>
        </div>
      </header>

      <main className="flex-1 px-6 pt-2 overflow-y-auto">
        {activeTab === 'itinerary' && (
          <div className="animate-fade-in space-y-6 mt-4">
            <div className="flex gap-2 overflow-x-auto pb-4">
              {DATE_RANGE.map((d, idx) => (
                <button key={d.date} onClick={() => setSelectedDay(d.date)} className={`flex-shrink-0 w-20 py-4 rounded-3xl flex flex-col items-center border transition-all ${selectedDay === d.date ? 'bg-[#0E1A40] text-white border-transparent shadow-xl' : 'bg-white text-gray-400 border-gray-100'}`}>
                  <span className="text-[10px] font-bold opacity-60 mb-1">{d.date.slice(5)}</span>
                  <span className="text-xl font-bold serif">{idx + 1}</span>
                  <span className="text-[9px] font-bold mt-1">週{d.dayOfWeek}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-between items-center px-1">
              <h2 className="serif text-xl font-bold border-l-4 border-[#0E1A40] pl-3">每日行程</h2>
              <button onClick={() => { setEditData({ time: '09:00', stayDuration: '01:00', displayName: '', actualLocation: '', note: '', transportToNext: { mode: 'transit', duration: '' } }); setShowModal('itinerary'); }} className="text-[11px] font-bold bg-[#0E1A40] text-white px-4 py-2 rounded-full shadow-lg border border-[#946A2D]/30">＋ 新增行程</button>
            </div>
            <div className="space-y-4">
              {sortedItinerary.map((item, idx) => (
                <div key={item.id} className="relative">
                  {idx > 0 && (
                    <div className="ml-12 my-2 p-3 bg-white/50 rounded-2xl border border-dashed border-gray-200 flex items-center justify-between gap-3 text-[10px] font-bold text-gray-400">
                      <div className="flex items-center gap-2">
                        <Icons.Transit />
                        <span className="text-[#946A2D]">{item.transportToNext?.duration || '待算'}</span>
                      </div>
                      <a href={getTransportLink(sortedItinerary[idx-1].actualLocation, item.actualLocation, item.transportToNext?.mode || 'transit')} target="_blank" className="p-1.5 bg-[#0E1A40] text-white rounded-lg shadow-sm"><Icons.ExternalLink /></a>
                    </div>
                  )}
                  <div className="pl-12 border-l-2 border-dashed border-[#946A2D]/30 pb-4 group" onClick={() => handleToggleAction(item.id)}>
                    <div className="absolute left-[-16px] top-2 w-8 h-8 bg-[#0E1A40] rounded-full flex items-center justify-center text-white text-[10px] font-bold serif border-4 border-white">{(idx + 1).toString().padStart(2, '0')}</div>
                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 mb-2"><span>{item.time} ({item.stayDuration})</span></div>
                    <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
                      <h3 className="font-bold serif text-[#0E1A40] text-lg">{item.displayName}</h3>
                      <p className="text-[10px] text-gray-400 mt-1">{item.actualLocation}</p>
                      {expandedItems.has(item.id) && (
                        <div className="flex gap-4 mt-4 animate-fade-in border-t pt-3 border-gray-50">
                          <button onClick={(e) => { e.stopPropagation(); setEditData(item); setShowModal('itinerary'); }} className="text-[10px] font-bold flex items-center gap-1 text-[#0E1A40]"><Icons.Pencil /> 修改</button>
                          <button onClick={(e) => { e.stopPropagation(); setItinerary(itinerary.filter(i => i.id !== item.id)); }} className="text-[10px] font-bold flex items-center gap-1 text-red-500"><Icons.Trash /> 刪除</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="mt-6 animate-fade-in space-y-6">
            <div className="text-center">
              <div className="w-24 h-24 bg-[#0E1A40] rounded-full mx-auto flex items-center justify-center text-white mb-4 border-4 border-white shadow-xl text-3xl serif">
                {currentUser[0]}
              </div>
              <h2 className="serif text-2xl font-bold text-[#0E1A40]">{currentUser}</h2>
            </div>
            
            <div className="bg-white rounded-[2.5rem] p-6 border border-gray-100 shadow-sm space-y-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">切換巫師身份</label>
              <div className="grid grid-cols-2 gap-3">
                {MEMBERS.map(m => (
                  <button key={m} onClick={() => setCurrentUser(m)} className={`py-4 rounded-2xl font-bold text-sm transition-all ${currentUser === m ? 'bg-[#0E1A40] text-white shadow-lg' : 'bg-[#f5f5f5] text-[#0E1A40]'}`}>{m}</button>
                ))}
              </div>
            </div>

            <div className="bg-[#0E1A40] rounded-[2.5rem] p-6 border border-[#946A2D]/30 shadow-xl space-y-4">
              <label className="text-[10px] font-bold text-[#946A2D] uppercase tracking-widest px-2 flex items-center gap-2"><Icons.Magic /> 團隊同步魔法</label>
              <div className="bg-white/5 p-4 rounded-2xl flex items-center justify-between border border-white/10">
                <div>
                   <p className="text-[11px] text-white font-bold">頻道：<span className="text-[#946A2D] font-mono">{roomId}</span></p>
                   <p className="text-[8px] text-white/40 mt-1 uppercase">成員修改將自動推送至所有人的手機</p>
                </div>
                <button onClick={() => setIsLiveSync(!isLiveSync)} className={`px-4 py-2 rounded-full text-[9px] font-bold transition-all shadow-md ${isLiveSync ? 'bg-[#946A2D] text-[#0E1A40]' : 'bg-gray-700 text-gray-300'}`}>
                  {isLiveSync ? '⚡️ 同步中' : '❌ 已暫停'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-6 border-l-8 border-[#0E1A40] shadow-sm space-y-4">
              <label className="text-[10px] font-bold text-[#0E1A40] uppercase tracking-widest px-2">🔮 魔法連線診斷</label>
              <button onClick={async () => { setTestResult({ msg: "診斷中..." }); const res = await testConnection(); setTestResult(res); }} className="w-full bg-[#f5f5f5] text-[#0E1A40] py-4 rounded-2xl text-[11px] font-bold active:scale-95 transition-all">🪄 測試所有連線狀態</button>
              {testResult.msg && (
                <div className={`p-4 rounded-2xl text-[10px] font-bold border ${testResult.ok ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
                  {testResult.msg}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-6 left-4 right-4 max-w-[448px] mx-auto glass rounded-[2.5rem] border border-[#946A2D]/40 py-4 px-6 shadow-2xl z-50 flex justify-between items-center">
        {(['itinerary', 'booking', 'split', 'settings'] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`flex flex-col items-center gap-1 w-1/4 transition-all ${activeTab === tab ? 'text-[#0E1A40] scale-110' : 'text-[#946A2D]'}`}>
            {tab === 'itinerary' ? <Icons.Map /> : tab === 'booking' ? <Icons.Ticket /> : tab === 'split' ? <Icons.Wallet /> : <Icons.User />}
            <span className="text-[8px] font-bold uppercase">{tab}</span>
          </button>
        ))}
      </nav>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-10">
          <div className="absolute inset-0 bg-[#0E1A40]/40 backdrop-blur-md" onClick={() => setShowModal(null)}></div>
          <div className="bg-white w-full max-w-md rounded-[3rem] p-8 z-10 shadow-2xl animate-fade-in border-t-[10px] border-[#0E1A40]">
             <div className="space-y-4">
               <h3 className="serif text-xl font-bold text-[#0E1A40]">魔法編輯</h3>
               {showModal === 'itinerary' && (
                 <>
                   <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 ml-2">時間</label><input type="time" value={editData.time} onChange={e => setEditData({ ...editData, time: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" /></div>
                   <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 ml-2">景點名稱</label><input type="text" placeholder="例如：富士山景觀纜車" value={editData.displayName} onChange={e => setEditData({ ...editData, displayName: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" /></div>
                   <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 ml-2">地址/座標</label><input type="text" placeholder="輸入地址" value={editData.actualLocation} onChange={e => setEditData({ ...editData, actualLocation: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" /></div>
                 </>
               )}
               <button onClick={saveModal} className="w-full bg-[#0E1A40] text-white py-6 rounded-3xl font-bold uppercase tracking-widest shadow-xl border border-[#946A2D]/40 mt-4 active:scale-95 transition-all">確認保存 🔮</button>
             </div>
          </div>
        </div>
      )}
      {isMagicLoading && <div className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-md flex items-center justify-center"><div className="bg-white p-10 rounded-[3rem] shadow-2xl animate-bounce"><Icons.Magic /></div></div>}
    </div>
  );
};

export default App;
