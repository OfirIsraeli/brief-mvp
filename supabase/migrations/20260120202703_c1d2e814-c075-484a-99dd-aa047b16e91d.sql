-- Create briefs table linked to authenticated users
CREATE TABLE public.briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  artists TEXT[] DEFAULT '{}',
  genres TEXT[] DEFAULT '{}',
  venues TEXT[] DEFAULT '{}',
  schedule JSONB NOT NULL DEFAULT '{}',
  delivery_method TEXT NOT NULL DEFAULT 'whatsapp',
  delivery_contact TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only the creator can read their own briefs
CREATE POLICY "Users can view their own briefs"
ON public.briefs
FOR SELECT
USING (auth.uid() = user_id);

-- Only the creator can insert briefs (must set user_id to their own id)
CREATE POLICY "Users can create their own briefs"
ON public.briefs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Only the creator can update their own briefs
CREATE POLICY "Users can update their own briefs"
ON public.briefs
FOR UPDATE
USING (auth.uid() = user_id);

-- Only the creator can delete their own briefs
CREATE POLICY "Users can delete their own briefs"
ON public.briefs
FOR DELETE
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_briefs_updated_at
BEFORE UPDATE ON public.briefs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();