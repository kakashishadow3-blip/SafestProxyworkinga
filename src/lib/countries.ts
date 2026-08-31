/* Complete country dataset (ISO 3166-1 alpha-2), grouped by region */
export const COUNTRY_GROUPS: [string, [string, string][]][] = [
  ['Asia', [
    ['Afghanistan', 'AF'], ['Armenia', 'AM'], ['Azerbaijan', 'AZ'], ['Bahrain', 'BH'], ['Bangladesh', 'BD'],
    ['Bhutan', 'BT'], ['Brunei', 'BN'], ['Cambodia', 'KH'], ['China', 'CN'], ['Cyprus', 'CY'],
    ['Georgia', 'GE'], ['Hong Kong', 'HK'], ['India', 'IN'], ['Indonesia', 'ID'], ['Iran', 'IR'],
    ['Iraq', 'IQ'], ['Israel', 'IL'], ['Japan', 'JP'], ['Jordan', 'JO'], ['Kazakhstan', 'KZ'],
    ['South Korea', 'KR'], ['Kyrgyzstan', 'KG'], ['Laos', 'LA'], ['Lebanon', 'LB'], ['Macao', 'MO'],
    ['Malaysia', 'MY'], ['Maldives', 'MV'], ['Mongolia', 'MN'], ['Myanmar', 'MM'], ['Nepal', 'NP'],
    ['Oman', 'OM'], ['Pakistan', 'PK'], ['Palestine', 'PS'], ['Philippines', 'PH'], ['Qatar', 'QA'],
    ['Saudi Arabia', 'SA'], ['Singapore', 'SG'], ['Sri Lanka', 'LK'], ['Taiwan', 'TW'], ['Tajikistan', 'TJ'],
    ['Thailand', 'TH'], ['Turkey', 'TR'], ['Turkmenistan', 'TM'], ['United Arab Emirates', 'AE'], ['Uzbekistan', 'UZ'],
    ['Vietnam', 'VN'],
  ]],
  ['Europe', [
    ['Albania', 'AL'], ['Andorra', 'AD'], ['Austria', 'AT'], ['Belarus', 'BY'], ['Belgium', 'BE'],
    ['Bosnia and Herzegovina', 'BA'], ['Bulgaria', 'BG'], ['Croatia', 'HR'], ['Czech Republic', 'CZ'], ['Denmark', 'DK'],
    ['Estonia', 'EE'], ['Finland', 'FI'], ['France', 'FR'], ['Germany', 'DE'], ['Greece', 'GR'],
    ['Hungary', 'HU'], ['Iceland', 'IS'], ['Ireland', 'IE'], ['Isle of Man', 'IM'], ['Italy', 'IT'],
    ['Jersey', 'JE'], ['Latvia', 'LV'], ['Liechtenstein', 'LI'], ['Lithuania', 'LT'], ['Luxembourg', 'LU'],
    ['Macedonia', 'MK'], ['Malta', 'MT'], ['Moldova', 'MD'], ['Monaco', 'MC'], ['Montenegro', 'ME'],
    ['Netherlands', 'NL'], ['Norway', 'NO'], ['Poland', 'PL'], ['Portugal', 'PT'], ['Romania', 'RO'],
    ['Russia', 'RU'], ['Serbia', 'RS'], ['Slovakia', 'SK'], ['Slovenia', 'SI'], ['Spain', 'ES'],
    ['Sweden', 'SE'], ['Switzerland', 'CH'], ['Ukraine', 'UA'], ['United Kingdom', 'GB'],
  ]],
  ['Africa', [
    ['Algeria', 'DZ'], ['Angola', 'AO'], ['Cameroon', 'CM'], ['Democratic Republic of the Congo', 'CD'], ['Ivory Coast', 'CI'],
    ['Egypt', 'EG'], ['Ethiopia', 'ET'], ['Gabon', 'GA'], ['Ghana', 'GH'], ['Kenya', 'KE'],
    ['Libya', 'LY'], ['Mauritius', 'MU'], ['Morocco', 'MA'], ['Nigeria', 'NG'], ['Somalia', 'SO'],
    ['South Africa', 'ZA'], ['Tanzania', 'TZ'], ['Togo', 'TG'], ['Tunisia', 'TN'], ['Uganda', 'UG'], ['Zimbabwe', 'ZW'],
  ]],
  ['Oceania', [['Australia', 'AU'], ['New Zealand', 'NZ']]],
  ['North America', [
    ['Bahamas', 'BS'], ['Belize', 'BZ'], ['Bermuda', 'BM'], ['Canada', 'CA'], ['Cayman Islands', 'KY'],
    ['Costa Rica', 'CR'], ['Cuba', 'CU'], ['Dominican Republic', 'DO'], ['El Salvador', 'SV'], ['Greenland', 'GL'],
    ['Guatemala', 'GT'], ['Jamaica', 'JM'], ['Mexico', 'MX'], ['Nicaragua', 'NI'], ['Panama', 'PA'],
    ['Puerto Rico', 'PR'], ['Trinidad and Tobago', 'TT'], ['United States', 'US'],
  ]],
  ['South America', [
    ['Argentina', 'AR'], ['Bolivia', 'BO'], ['Brazil', 'BR'], ['Chile', 'CL'], ['Colombia', 'CO'],
    ['Ecuador', 'EC'], ['Paraguay', 'PY'], ['Peru', 'PE'], ['Uruguay', 'UY'],
  ]],
]

/* Flat name list derived from the dataset above (billing address + KYC document country) */
export const COUNTRIES: string[] = COUNTRY_GROUPS.flatMap(([, items]) => items.map(([name]) => name))
