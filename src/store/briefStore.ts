import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Brief, OnboardingData } from '@/types/brief';

interface BriefStore {
  briefs: Brief[];
  onboardingData: OnboardingData;
  addBrief: (brief: Brief) => void;
  updateBrief: (id: string, updates: Partial<Brief>) => void;
  deleteBrief: (id: string) => void;
  toggleBriefActive: (id: string) => void;
  setOnboardingData: (data: Partial<OnboardingData>) => void;
  resetOnboarding: () => void;
}

const initialOnboarding: OnboardingData = {
  step: 0,
  artists: [],
  genres: [],
  venues: [],
  schedule: {
    dayOfWeek: 'Thursday',
    time: '16:00',
    eventWindow: 'This weekend',
  },
  deliveryMethod: 'whatsapp',
  deliveryContact: '',
};

export const useBriefStore = create<BriefStore>()(
  persist(
    (set) => ({
      briefs: [],
      onboardingData: initialOnboarding,
      addBrief: (brief) =>
        set((state) => ({ briefs: [...state.briefs, brief] })),
      updateBrief: (id, updates) =>
        set((state) => ({
          briefs: state.briefs.map((b) =>
            b.id === id ? { ...b, ...updates } : b
          ),
        })),
      deleteBrief: (id) =>
        set((state) => ({
          briefs: state.briefs.filter((b) => b.id !== id),
        })),
      toggleBriefActive: (id) =>
        set((state) => ({
          briefs: state.briefs.map((b) =>
            b.id === id ? { ...b, isActive: !b.isActive } : b
          ),
        })),
      setOnboardingData: (data) =>
        set((state) => ({
          onboardingData: { ...state.onboardingData, ...data },
        })),
      resetOnboarding: () => set({ onboardingData: initialOnboarding }),
    }),
    {
      name: 'brief-storage',
    }
  )
);
