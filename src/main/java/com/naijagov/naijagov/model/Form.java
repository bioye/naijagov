package com.naijagov.naijagov.model;

import org.springframework.data.domain.Page;

public class Form {

  private Page<Ward> wardsPage;
  private Page<PollingUnit> wardPage;
  private Iterable<Ward> wards;
  private Page<PollingUnit> pollingUnitsPage;
  private Iterable<PollingUnit> pollingUnits;

  public Page<PollingUnit> getWardPage() {
    return wardPage;
  }

  public Page<Ward> getWardsPage() {
    return wardsPage;
  }

  public Page<PollingUnit> getPollingUnitsPage() {
    return pollingUnitsPage;
  }

  public Iterable<Ward> getWards() {
    return wards;
  }

  public Iterable<PollingUnit> getPollingUnits() {
    return pollingUnits;
  }

  public void setWardPage(Page<PollingUnit> wardPage) {
    this.wardPage = wardPage;
  }

  public void setWardsPage(Page<Ward> wardsPage) {
    this.wardsPage = wardsPage;
  }

  public void setPollingUnitsPage(Page<PollingUnit> pollingUnitPage) {
    this.pollingUnitsPage = pollingUnitPage;
  }

  public void setWards(Iterable<Ward> wards) {
    this.wards = wards;
  }

  public void setPollingUnits(Iterable<PollingUnit> pollingUnits) {
    this.pollingUnits = pollingUnits;
  }
}