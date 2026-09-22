update public.plans
   set price = 5000,
       currency = 'ARS',
       active = true
 where code = 'BASIC';

update public.plans
   set price = 20000,
       currency = 'ARS',
       active = true
 where code = 'PRO';
