package com.naijagov.naijagov.model;

import org.springframework.data.domain.Page;

public class Form {

  private Page<LocalGov> localGovsPage;
  private Iterable<LocalGov> localGovs;//
  private Page<Ward> localGovPage;
  private Page<Ward> wardsPage;
  private Iterable<Ward> wards;
  private Page<PollingUnit> wardPage;
  private Page<PollingUnit> pollingUnitsPage;
  private Iterable<PollingUnit> pollingUnits;

  public Page<Ward> getLocalGovPage(){
    return localGovPage;
  }

  public Page<LocalGov> getLocalGovsPage(){
    return localGovsPage;
  }

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

  public void setLocalGovPage(Page<Ward> localGovPage) {
    this.localGovPage = localGovPage;
  }

  public void setLocalGovsPage(Page<LocalGov> localGovsPage) {
    this.localGovsPage = localGovsPage;
  }

  public void setWardsPage(Page<Ward> wardsPage) {
    this.wardsPage = wardsPage;
  }

  public void setWardPage(Page<PollingUnit> wardPage) {
    this.wardPage = wardPage;
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