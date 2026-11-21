"""Bundle best qualifying times across Q1, Q2 and Q3 for the optional flying lap."""
from season import JOL, OPEN, OUT, fetch, save

def seconds(value):
    if not value or ':' not in value:
        return None
    minutes, sec = value.split(':')
    return 60 * int(minutes) + float(sec)

def session_times(rnd, rows):
    sessions = fetch('sessions', OPEN + 'sessions?year=2025&session_name=Qualifying')
    if len(sessions) != 24:
        raise ValueError('Incomplete 2025 qualifying calendar')
    session = sorted(sessions, key=lambda s: s['date_start'])[rnd - 1]['session_key']
    classification = fetch(f'qualifying-result-{session}', OPEN + f'session_result?session_key={session}')
    codes = {int(row['number']): row['Driver']['code'] for row in rows}
    times = {}
    for entry in classification:
        valid = [v for v in entry['duration'] or [] if v is not None and v > 0]
        if valid and not entry['dsq']:
            times[codes[entry['driver_number']]] = min(valid)
    return times

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
        if not result.keys() - {'VER'}:
            result = session_times(rnd, rows)
        if not result.keys() - {'VER'}:
            raise ValueError(f'Round {rnd} has no rival qualifying times')
        times.append(result)
    save(OUT/'qualifying.json', times)
if __name__ == '__main__':
    main()
