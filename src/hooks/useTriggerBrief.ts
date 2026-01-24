import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TriggerResult {
  success: boolean;
  traceId: string;
  briefId: string;
  briefName: string;
  eventsScraped: number;
  eventsFiltered: number;
  reasoning?: string;
  deliveryMethod: string;
}

export const useTriggerBrief = () => {
  const [isTriggering, setIsTriggering] = useState<string | null>(null);

  const triggerBrief = async (briefId: string): Promise<TriggerResult | null> => {
    setIsTriggering(briefId);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error('You must be logged in to trigger a brief');
        return null;
      }

      const response = await supabase.functions.invoke('trigger-brief', {
        body: { briefId },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data as TriggerResult;
      
      toast.success(
        `Digest sent! Found ${result.eventsFiltered} events from ${result.eventsScraped} scraped.`,
        { description: `Delivered via ${result.deliveryMethod}` }
      );
      
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to trigger brief';
      toast.error('Failed to trigger brief', { description: message });
      return null;
    } finally {
      setIsTriggering(null);
    }
  };

  return {
    triggerBrief,
    isTriggering,
  };
};
