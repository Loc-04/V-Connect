-- Enable RLS if not already enabled
ALTER TABLE public.provinces ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to read provinces and wards
CREATE POLICY "provinces_select_authenticated" ON public.provinces FOR
SELECT TO authenticated USING (true);

CREATE POLICY "wards_select_authenticated" ON public.wards FOR
SELECT TO authenticated USING (true);