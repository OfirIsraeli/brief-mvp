import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Brief } from '@/types/brief';

interface BriefRow {
  id: string;
  user_id: string;
  name: string;
  artists: string[];
  genres: string[];
  venues: string[];
  schedule: {
    dayOfWeek: string;
    time: string;
    eventWindow: string;
  };
  delivery_method: string;
  delivery_contact: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const mapRowToBrief = (row: BriefRow): Brief => ({
  id: row.id,
  name: row.name,
  artists: row.artists || [],
  genres: row.genres || [],
  venues: row.venues || [],
  schedule: row.schedule as Brief['schedule'],
  deliveryMethod: row.delivery_method as 'whatsapp' | 'email',
  deliveryContact: row.delivery_contact,
  createdAt: new Date(row.created_at),
  isActive: row.is_active,
});

export const useBriefs = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: briefs = [], isLoading, error } = useQuery({
    queryKey: ['briefs', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('briefs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data as BriefRow[]).map(mapRowToBrief);
    },
    enabled: !!user,
  });

  const addBriefMutation = useMutation({
    mutationFn: async (brief: Omit<Brief, 'id' | 'createdAt'>) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('briefs')
        .insert({
          user_id: user.id,
          name: brief.name,
          artists: brief.artists,
          genres: brief.genres,
          venues: brief.venues,
          schedule: brief.schedule,
          delivery_method: brief.deliveryMethod,
          delivery_contact: brief.deliveryContact,
          is_active: brief.isActive,
        })
        .select()
        .single();

      if (error) throw error;
      return mapRowToBrief(data as BriefRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs', user?.id] });
    },
  });

  const updateBriefMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Brief> }) => {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.artists !== undefined) dbUpdates.artists = updates.artists;
      if (updates.genres !== undefined) dbUpdates.genres = updates.genres;
      if (updates.venues !== undefined) dbUpdates.venues = updates.venues;
      if (updates.schedule !== undefined) dbUpdates.schedule = updates.schedule;
      if (updates.deliveryMethod !== undefined) dbUpdates.delivery_method = updates.deliveryMethod;
      if (updates.deliveryContact !== undefined) dbUpdates.delivery_contact = updates.deliveryContact;
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

      const { error } = await supabase
        .from('briefs')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs', user?.id] });
    },
  });

  const deleteBriefMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('briefs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs', user?.id] });
    },
  });

  const toggleBriefActive = async (id: string) => {
    const brief = briefs.find(b => b.id === id);
    if (brief) {
      await updateBriefMutation.mutateAsync({
        id,
        updates: { isActive: !brief.isActive },
      });
    }
  };

  return {
    briefs,
    isLoading,
    error,
    addBrief: addBriefMutation.mutateAsync,
    updateBrief: updateBriefMutation.mutateAsync,
    deleteBrief: deleteBriefMutation.mutateAsync,
    toggleBriefActive,
    isAdding: addBriefMutation.isPending,
    isUpdating: updateBriefMutation.isPending,
    isDeleting: deleteBriefMutation.isPending,
  };
};
