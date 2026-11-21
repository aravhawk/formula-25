"""Bundle best qualifying times across Q1, Q2 and Q3 for the optional flying lap."""
from season import JOL, OUT, fetch, save

def seconds(value):
    if not value or ':' not in value:
        return None
    minutes, sec = value.split(':')
    return 60 * int(minutes) + float(sec)

def main():
    times = []
    for rnd in range(1, 25):
        rows = fetch(f'qualifying-{rnd}', JOL + f'/{rnd}/qualifying.json')['MRData']['RaceTable']['Races'][0]['QualifyingResults']
        result = {}
        for row in rows:
            laps = [seconds(row.get(q)) for q in ('Q1','Q2','Q3')]
            valid = [v for v in laps if v]
            if valid:
                result[row['Driver']['code']] = round(min(valid), 3)
        times.append(result)
    save(OUT/'qualifying.json', times)
if __name__ == '__main__':
    main()
