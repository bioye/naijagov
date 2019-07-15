package com.naijagov.naijagov.model;

import java.io.Serializable;

import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.ManyToOne;

@Entity
public class PollingUnit implements Serializable {

  public Ward getWard() {
    return ward;
  }

  public String getDescription() {
    return description;
  }

  public int getCode() {
    return code;
  }

  public String getFullCode() {
    return fullCode;
  }

  public float getLongitude() {
    return longitude;
  }

  public float getLatitude() {
    return latitude;
  }

  public int getId() {
    return id;
  }

  @ManyToOne
  private Ward ward;
  private String description;
  private int code;
  private String fullCode;
  private float longitude;
  private float latitude;
  @Id
  private int id;

  private static final long serialVersionUID = 1759791770074149187L;

}