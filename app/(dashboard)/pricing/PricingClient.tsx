'use client'

import { useState, useMemo } from 'react'

const DEFAULTS = {
  eventHours: 1.5,
  setupMin: 30,
  cleanupMin: 30,
  drivingDistOneway: 35,
  drivingTimeOnewayMin: 45,
  loadMin: 15,
  unloadMin: 15,
  numLeads: 1,
  numCoords: 0,
  leadRate: 20.0,
  coordRate: 18.0,
  mileageRate: 0.725,
  vanMpg: 15,
  gasPrice: 3.5,
  processingFee: 3.0,
  staffCostTarget: 17.5,
  travelFee: 0,
}

type Vehicle = { id: number; label: string; isCompany: boolean }

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

type SliderInputProps = {
  label: string
  value: number
  onChange: (val: number) => void
  min: number
  max: number
  step: number
  unit?: string
  note?: string
}

function SliderInput({ label, value, onChange, min, max, step, unit, note }: SliderInputProps) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#c8cad0', letterSpacing: '0.02em', fontFamily: "'DM Sans', sans-serif" }}>{label}</label>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f0f0f0', fontFamily: "'JetBrains Mono', monospace" }}>
          {unit === '$' ? fmt(value) : `${value}${unit || ''}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: '#6ee05a' }}
      />
      {note && <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>{note}</div>}
    </div>
  )
}

type ToggleOption = { label: string; value: boolean }

type ToggleButtonProps = {
  label?: string
  options: ToggleOption[]
  value: boolean
  onChange: (val: boolean) => void
}

function ToggleButton({ label, options, value, onChange }: ToggleButtonProps) {
  return (
    <div style={{ marginBottom: label ? 18 : 0 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 600, color: '#c8cad0', letterSpacing: '0.02em', display: 'block', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>{label}</label>
      )}
      <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #333' }}>
        {options.map((opt) => (
          <button
            key={opt.value.toString()}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: '9px 14px',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              border: 'none',
              cursor: 'pointer',
              background: value === opt.value ? '#6ee05a' : '#1a1c22',
              color: value === opt.value ? '#0d0e12' : '#888',
              transition: 'all 0.2s ease',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

type ResultRowProps = {
  label: string
  value: string
  bold?: boolean
  accent?: boolean
  sub?: boolean
  border?: boolean
}

function ResultRow({ label, value, bold, accent, sub, border }: ResultRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: sub ? '5px 0 5px 16px' : '8px 0',
        borderTop: border ? '1px solid #2a2c32' : 'none',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <span style={{ fontSize: sub ? 12 : 13, color: sub ? '#666' : '#aaa', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span
        style={{
          fontSize: bold ? 16 : 14,
          fontWeight: bold ? 800 : 500,
          color: accent ? '#6ee05a' : bold ? '#f0f0f0' : '#ccc',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {value}
      </span>
    </div>
  )
}

export function PricingClient() {
  const [s, setS] = useState(DEFAULTS)
  const up = <K extends keyof typeof DEFAULTS>(key: K) => (val: number) =>
    setS((p) => ({ ...p, [key]: val }))

  const [vehicles, setVehicles] = useState<Vehicle[]>([
    { id: 1, label: 'Vehicle 1', isCompany: false },
  ])

  const updateVehicle = (id: number, patch: Partial<Vehicle>) =>
    setVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  const removeVehicle = (id: number) =>
    setVehicles((prev) => prev.filter((v) => v.id !== id))

  const addVehicle = () =>
    setVehicles((prev) => {
      const nextId = prev.length ? Math.max(...prev.map((v) => v.id)) + 1 : 1
      return [...prev, { id: nextId, label: `Vehicle ${nextId}`, isCompany: false }]
    })

  const totalStaff = s.numLeads + s.numCoords
  const noStaff = s.numLeads === 0 && s.numCoords === 0

  const calc = useMemo(() => {
    const onsiteHrs = s.eventHours + s.setupMin / 60 + s.cleanupMin / 60
    const driveHrs = (s.drivingTimeOnewayMin * 2) / 60
    const warehouseHrs = (s.loadMin + s.unloadMin) / 60
    const totalShiftHrs = onsiteHrs + driveHrs + warehouseHrs
    const roundedShift = Math.round(totalShiftHrs * 100) / 100

    const totalMiles = s.drivingDistOneway * 2

    const leadWages = s.numLeads * s.leadRate * roundedShift
    const coordWages = s.numCoords * s.coordRate * roundedShift
    const totalWages = leadWages + coordWages

    const vehicleCosts = vehicles.map((v) => {
      if (v.isCompany) {
        return { ...v, mileageReimb: 0, fuelCost: (totalMiles / s.vanMpg) * s.gasPrice }
      }
      return { ...v, mileageReimb: totalMiles * s.mileageRate, fuelCost: 0 }
    })

    const totalMileageReimb = vehicleCosts.reduce((a, v) => a + v.mileageReimb, 0)
    const totalFuelCost = vehicleCosts.reduce((a, v) => a + v.fuelCost, 0)
    const totalStaffCost = totalWages + totalMileageReimb // fuel excluded per spec

    const targetPct = s.staffCostTarget / 100
    const minPriceBeforeTravelFee = totalStaffCost / targetPct
    const totalCustomerPrice = minPriceBeforeTravelFee + s.travelFee

    const processingAmount = totalCustomerPrice * (s.processingFee / 100)
    const netRevenue = totalCustomerPrice - processingAmount

    const staffPctActual = (totalStaffCost / totalCustomerPrice) * 100
    const remainingMargin = netRevenue - totalStaffCost - totalFuelCost
    const remainingPct = (remainingMargin / totalCustomerPrice) * 100

    return {
      onsiteHrs,
      driveHrs,
      warehouseHrs,
      totalShiftHrs: roundedShift,
      totalMiles,
      leadWages,
      coordWages,
      totalWages,
      vehicleCosts,
      totalMileageReimb,
      totalFuelCost,
      totalStaffCost,
      minPriceBeforeTravelFee,
      totalCustomerPrice,
      processingAmount,
      netRevenue,
      staffPctActual,
      remainingMargin,
      remainingPct,
    }
  }, [s, vehicles])

  const personalCount = vehicles.filter((v) => !v.isCompany).length
  const companyCount = vehicles.filter((v) => v.isCompany).length

  return (
    <div style={{ margin: -24, background: '#0d0e12', color: '#f0f0f0', minHeight: 'calc(100vh - 48px)', padding: '32px 16px', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @media (max-width: 768px) {
          .pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-block', background: '#6ee05a', color: '#0d0e12', fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 4, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
            Wonderfly Games
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '8px 0 4px', letterSpacing: '-0.02em', fontFamily: "'DM Sans', sans-serif" }}>
            Event Pricing Calculator
          </h1>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Minimum rental price based on staff cost target</p>
        </div>

        <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* LEFT — Inputs */}
          <div>
            {/* Event Parameters */}
            <div style={{ background: '#13151b', borderRadius: 12, padding: 22, marginBottom: 16, border: '1px solid #1e2028' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6ee05a', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Event Parameters</h3>
              <SliderInput label="Event Length" value={s.eventHours} onChange={up('eventHours')} min={0.5} max={8} step={0.25} unit=" hrs" />
              <SliderInput label="Setup Time" value={s.setupMin} onChange={up('setupMin')} min={0} max={120} step={5} unit=" min" />
              <SliderInput label="Cleanup Time" value={s.cleanupMin} onChange={up('cleanupMin')} min={0} max={120} step={5} unit=" min" />
            </div>

            {/* Travel */}
            <div style={{ background: '#13151b', borderRadius: 12, padding: 22, marginBottom: 16, border: '1px solid #1e2028' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6ee05a', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Travel</h3>
              <SliderInput label="One-Way Distance" value={s.drivingDistOneway} onChange={up('drivingDistOneway')} min={1} max={250} step={1} unit=" mi" />
              <SliderInput label="One-Way Drive Time" value={s.drivingTimeOnewayMin} onChange={up('drivingTimeOnewayMin')} min={5} max={180} step={5} unit=" min" />
              <SliderInput label="Warehouse Load-Up" value={s.loadMin} onChange={up('loadMin')} min={0} max={60} step={5} unit=" min" />
              <SliderInput label="Warehouse Unload" value={s.unloadMin} onChange={up('unloadMin')} min={0} max={60} step={5} unit=" min" />
            </div>

            {/* Staff */}
            <div style={{ background: '#13151b', borderRadius: 12, padding: 22, marginBottom: 16, border: '1px solid #1e2028' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6ee05a', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Staff</h3>
              <SliderInput label="Lead Coordinators" value={s.numLeads} onChange={up('numLeads')} min={0} max={4} step={1} unit="" />
              <SliderInput label="Coordinators" value={s.numCoords} onChange={up('numCoords')} min={0} max={6} step={1} unit="" />
              {noStaff && (
                <div style={{ fontSize: 12, color: '#ff5555', fontWeight: 600, marginTop: -6 }}>
                  At least one staff member is required.
                </div>
              )}
            </div>

            {/* Vehicles */}
            <div style={{ background: '#13151b', borderRadius: 12, padding: 22, marginBottom: 16, border: '1px solid #1e2028' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6ee05a', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Vehicles</h3>
              {vehicles.map((v) => (
                <div key={v.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #1e2028' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input
                      type="text"
                      value={v.label}
                      onChange={(e) => updateVehicle(v.id, { label: e.target.value })}
                      style={{
                        flex: 1,
                        background: '#1a1c22',
                        border: '1px solid #333',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#f0f0f0',
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    />
                    {vehicles.length > 1 && (
                      <button
                        onClick={() => removeVehicle(v.id)}
                        aria-label={`Remove ${v.label}`}
                        style={{
                          flexShrink: 0,
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          border: '1px solid #333',
                          background: '#1a1c22',
                          color: '#888',
                          fontSize: 14,
                          cursor: 'pointer',
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <ToggleButton
                    options={[
                      { label: 'Personal', value: false },
                      { label: 'Company', value: true },
                    ]}
                    value={v.isCompany}
                    onChange={(val) => updateVehicle(v.id, { isCompany: val })}
                  />
                </div>
              ))}
              <button
                onClick={addVehicle}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  border: '1px dashed #333',
                  borderRadius: 8,
                  background: 'transparent',
                  color: '#6ee05a',
                  cursor: 'pointer',
                }}
              >
                + Add Vehicle
              </button>
            </div>

            {/* Cost Rates */}
            <div style={{ background: '#13151b', borderRadius: 12, padding: 22, border: '1px solid #1e2028' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6ee05a', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Cost Rates</h3>
              <SliderInput label="Lead Coordinator Rate (incl. payroll tax)" value={s.leadRate} onChange={up('leadRate')} min={10} max={50} step={0.5} unit="$" />
              <SliderInput label="Coordinator Rate (incl. payroll tax)" value={s.coordRate} onChange={up('coordRate')} min={10} max={50} step={0.5} unit="$" />
              <SliderInput label="Mileage Rate (personal)" value={s.mileageRate} onChange={up('mileageRate')} min={0.3} max={1.0} step={0.005} unit="/mi" note="IRS 2025: $0.70/mi" />
              <SliderInput label="Company Van MPG" value={s.vanMpg} onChange={up('vanMpg')} min={8} max={30} step={0.5} unit=" mpg" />
              <SliderInput label="Gas Price" value={s.gasPrice} onChange={up('gasPrice')} min={2.0} max={6.0} step={0.1} unit="$" />
              <SliderInput label="Travel Fee to Customer" value={s.travelFee} onChange={up('travelFee')} min={0} max={500} step={5} unit="$" />
              <SliderInput label="Processing Fee" value={s.processingFee} onChange={up('processingFee')} min={0} max={5} step={0.1} unit="%" />
              <SliderInput label="Staff Cost Target %" value={s.staffCostTarget} onChange={up('staffCostTarget')} min={5} max={50} step={0.5} unit="%" />
            </div>
          </div>

          {/* RIGHT — Results */}
          <div>
            {/* Big Price */}
            <div style={{ background: 'linear-gradient(135deg, #161a12 0%, #13151b 50%)', borderRadius: 14, padding: 28, marginBottom: 16, border: '1px solid #2a3522', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6ee05a', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
                Minimum Customer Price
              </div>
              <div style={{ fontSize: 48, fontWeight: 800, color: '#6ee05a', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                {fmt(Math.ceil(calc.totalCustomerPrice))}
              </div>
              {s.travelFee > 0 && (
                <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
                  {fmt(Math.ceil(calc.minPriceBeforeTravelFee))} rental + {fmt(s.travelFee)} travel fee
                </div>
              )}
              <div style={{ fontSize: 12, color: '#555', marginTop: 8 }}>
                {totalStaff} staff · {vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'} ({personalCount} personal, {companyCount} company) · {calc.totalMiles} mi round trip
              </div>
            </div>

            {/* Shift Breakdown */}
            <div style={{ background: '#13151b', borderRadius: 12, padding: 22, marginBottom: 16, border: '1px solid #1e2028' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6ee05a', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>Shift Breakdown</h3>
              <ResultRow label="On-Site Time" value={`${calc.onsiteHrs.toFixed(2)} hrs`} />
              <ResultRow label="Driving Time" value={`${calc.driveHrs.toFixed(2)} hrs`} />
              <ResultRow label="Warehouse Time" value={`${calc.warehouseHrs.toFixed(2)} hrs`} />
              <ResultRow label="Total Shift per Staff" value={`${calc.totalShiftHrs.toFixed(2)} hrs`} bold border />
              <ResultRow label={`Total Staff Hours (${totalStaff} × ${calc.totalShiftHrs.toFixed(2)})`} value={`${(totalStaff * calc.totalShiftHrs).toFixed(2)} hrs`} sub />
            </div>

            {/* Cost Breakdown */}
            <div style={{ background: '#13151b', borderRadius: 12, padding: 22, marginBottom: 16, border: '1px solid #1e2028' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6ee05a', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>Cost Breakdown</h3>
              <ResultRow label={`Lead Wages (${s.numLeads} × $${s.leadRate.toFixed(2)} × ${calc.totalShiftHrs.toFixed(2)} hrs)`} value={fmt(calc.leadWages)} />
              {s.numCoords > 0 && (
                <ResultRow label={`Coordinator Wages (${s.numCoords} × $${s.coordRate.toFixed(2)} × ${calc.totalShiftHrs.toFixed(2)} hrs)`} value={fmt(calc.coordWages)} />
              )}
              {calc.vehicleCosts.filter((v) => !v.isCompany).map((v) => (
                <ResultRow key={v.id} label={`${v.label} – Mileage (${calc.totalMiles} mi × $${s.mileageRate.toFixed(3)})`} value={fmt(v.mileageReimb)} />
              ))}
              <ResultRow label="Total Staff Cost" value={fmt(calc.totalStaffCost)} bold border />
              {calc.vehicleCosts.filter((v) => v.isCompany).map((v) => (
                <ResultRow key={v.id} label={`${v.label} – Fuel (${calc.totalMiles} mi ÷ ${s.vanMpg} mpg × $${s.gasPrice.toFixed(2)})`} value={fmt(v.fuelCost)} />
              ))}
            </div>

            {/* Revenue Breakdown */}
            <div style={{ background: '#13151b', borderRadius: 12, padding: 22, marginBottom: 16, border: '1px solid #1e2028' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6ee05a', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>Revenue Breakdown</h3>
              <ResultRow label="Customer Pays" value={fmt(Math.ceil(calc.totalCustomerPrice))} bold />
              <ResultRow label={`Processing Fee (${s.processingFee}%)`} value={`−${fmt(calc.processingAmount)}`} />
              <ResultRow label="Net Revenue" value={fmt(calc.netRevenue)} border />
              <ResultRow label="Staff Cost" value={`−${fmt(calc.totalStaffCost)}`} />
              {companyCount > 0 && <ResultRow label="Fuel Cost" value={`−${fmt(calc.totalFuelCost)}`} />}
              <ResultRow label="Remaining Gross Margin" value={fmt(calc.remainingMargin)} bold border accent />
            </div>

            {/* Percentages */}
            <div style={{ background: '#13151b', borderRadius: 12, padding: 22, border: '1px solid #1e2028' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6ee05a', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Margin Analysis</h3>
              {/* Staff Cost % Bar */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#aaa' }}>Staff Cost %</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: calc.staffPctActual <= s.staffCostTarget ? '#6ee05a' : '#ff5555' }}>
                    {calc.staffPctActual.toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: 8, background: '#1e2028', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ height: '100%', width: `${Math.min(calc.staffPctActual, 100)}%`, background: calc.staffPctActual <= s.staffCostTarget ? '#6ee05a' : '#ff5555', borderRadius: 4, transition: 'width 0.3s ease' }} />
                  <div style={{ position: 'absolute', top: 0, left: `${s.staffCostTarget}%`, width: 2, height: '100%', background: '#fff', opacity: 0.4 }} />
                </div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>Target: {s.staffCostTarget}%</div>
              </div>
              {/* Gross Margin % Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#aaa' }}>Remaining Gross Margin %</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#6ee05a' }}>
                    {calc.remainingPct.toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: 8, background: '#1e2028', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(calc.remainingPct, 100)}%`, background: '#6ee05a', borderRadius: 4, transition: 'width 0.3s ease' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
